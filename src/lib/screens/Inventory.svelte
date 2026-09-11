<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import SpeedDial from '../components/SpeedDial.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import ProductForm from './ProductForm.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import { db, modelOptions, hexForColor, deleteProducts, modelGroupKey } from '../db.js';
  import { fmtIQD, fmtNum, buzz, fileToPhotoDataUrl } from '../utils.js';
  import { toastErr, toastOk, askConfirm, invoicePreset, catalogFilters, filtersOpen } from '../store.js';
  import { get } from 'svelte/store';

  let { goto } = $props();

  let products = $state([]);
  let opts = $state({ types: [], seasons: [], colors: [] });

  /* shared filters — same state drives البيع too, and survives tab switches */
  let f = $state(JSON.parse(JSON.stringify(get(catalogFilters))));
  $effect(() => { catalogFilters.set(f); });

  /* the filter CARD collapses by default — expanding it never touches the filter values */
  let fOpen = $state(get(filtersOpen));
  $effect(() => { filtersOpen.set(fOpen); });

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, o] = await Promise.all([db.products.toArray(), modelOptions()]);
      if (!alive) return;
      products = p;
      opts = o;
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const cats = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.length, clear: true },
    ...[...new Set(products.map((p) => p.category))].map((c) => ({ value: c, label: c, icon: 'tag', count: products.filter((p) => p.category === c).length }))
  ]);
  const types = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.type).length, clear: true },
    ...opts.types.map((t) => ({ value: t, label: t, icon: 'list', count: products.filter((p) => p.type === t).length }))
  ]);
  const seasons = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.season).length, clear: true },
    ...opts.seasons.map((s) => ({ value: s, label: s, icon: 'calendar', count: products.filter((p) => p.season === s).length }))
  ]);
  const AVAIL = [
    { value: 'all', label: 'الكل', icon: 'dots', clear: true },
    { value: 'in', label: 'متوفر', icon: 'check' },
    { value: 'out', label: 'نفد', icon: 'x' }
  ];
  const SORTS = [
    { value: 'new', label: 'الأحدث', icon: 'sparkle', clear: true },
    { value: 'price', label: 'الأعلى سعراً', icon: 'tag' },
    { value: 'qty', label: 'الأقل كمية', icon: 'chart' }
  ];

  /* ---- One card = one model (all its colors & sizes together) ---- */
  const groups = $derived.by(() => {
    let list = products;
    if (f.cat !== 'الكل') list = list.filter((p) => p.category === f.cat);
    if (f.typ !== 'الكل') list = list.filter((p) => p.type === f.typ);
    if (f.season !== 'الكل') list = list.filter((p) => p.season === f.season);
    if (f.q.trim()) {
      const s = f.q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.color, p.sku, p.size, p.barcode, p.type, p.season, p.material].filter(Boolean).join(' ').toLowerCase().includes(s)
      );
    }
    const map = new Map();
    for (const p of list) {
      const k = modelGroupKey(p); // الرقم الداخلي يجمع الموديل — الاسم احتياط للقديم
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    }
    const out = [];
    for (const items of map.values()) {
      const qty = items.reduce((a, x) => a + (x.qty || 0), 0);
      const price = Math.max(...items.map((x) => x.price || 0));
      const lead = items[0];
      const colorMap = new Map();
      for (const p of items) {
        const c = (p.color || '').trim();
        if (!colorMap.has(c)) colorMap.set(c, []);
        colorMap.get(c).push(p);
      }
      const colorRows = [...colorMap.entries()].map(([c, ps]) => {
        const sizes = [...ps]
          .sort((a, b) => (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0))
          .map((p) => ({ size: String(p.size || '—').trim(), qty: p.qty || 0, p }));
        return { color: c, qty: ps.reduce((a, x) => a + (x.qty || 0), 0), sizes };
      });
      out.push({
        key: modelGroupKey(lead),
        items, qty, price, lead,
        name: lead.name, category: lead.category,
        type: lead.type, season: lead.season, material: lead.material,
        photo: items.find((x) => x.photo)?.photo || null,
        createdAt: Math.max(...items.map((x) => new Date(x.createdAt || 0).getTime())),
        colorRows,
        sizesCount: new Set(items.map((x) => String(x.size || '').trim()).filter(Boolean)).size,
        supplier: items.find((x) => x.supplier)?.supplier || ''
      });
    }
    /* status filter works on the model's TOTAL stock — «نفد» = zero pieces */
    if (f.availInv === 'in') return out.filter((g) => g.qty > 0);
    if (f.availInv === 'out') return out.filter((g) => g.qty === 0);
    return out;
  });

  const sorted = $derived.by(() => {
    const list = [...groups];
    if (f.sort === 'new') list.sort((a, b) => b.createdAt - a.createdAt);
    if (f.sort === 'price') list.sort((a, b) => b.price - a.price);
    if (f.sort === 'qty') list.sort((a, b) => a.qty - b.qty);
    return list;
  });

  /* ---- Premium filter bar state ---- */
  const activeCount = $derived((f.cat !== 'الكل' ? 1 : 0) + (f.typ !== 'الكل' ? 1 : 0) + (f.season !== 'الكل' ? 1 : 0) + (f.availInv !== 'all' ? 1 : 0) + (f.sort !== 'new' ? 1 : 0) + (f.q.trim() ? 1 : 0));
  const isDefault = $derived(f.cat === 'الكل' && f.typ === 'الكل' && f.season === 'الكل' && f.availInv === 'all' && f.sort === 'new' && !f.q.trim());
  const totalModels = $derived(groups.length);

  function clearAllFilters() {
    f = { q: '', cat: 'الكل', typ: 'الكل', season: 'الكل', availInv: 'all', availSell: 'in', sort: 'new' };
    buzz(10);
  }
  const activeTags = $derived.by(() => {
    const tags = [];
    if (f.q.trim()) tags.push({ key: 'q', label: `بحث: ${f.q.trim()}` });
    if (f.cat !== 'الكل') tags.push({ key: 'cat', label: f.cat });
    if (f.typ !== 'الكل') tags.push({ key: 'typ', label: f.typ });
    if (f.season !== 'الكل') tags.push({ key: 'season', label: f.season });
    if (f.availInv !== 'all') tags.push({ key: 'avail', label: AVAIL.find((a) => a.value === f.availInv)?.label || '' });
    if (f.sort !== 'new') tags.push({ key: 'sort', label: `ترتيب: ${SORTS.find((s) => s.value === f.sort)?.label || ''}` });
    return tags;
  });
  function removeTag(key) {
    if (key === 'q') f.q = '';
    if (key === 'cat') f.cat = 'الكل';
    if (key === 'typ') f.typ = 'الكل';
    if (key === 'season') f.season = 'الكل';
    if (key === 'avail') f.availInv = 'all';
    if (key === 'sort') f.sort = 'new';
    buzz(6);
  }

  let showForm = $state(false);
  let editing = $state(null);
  let detailGroup = $state(null);
  let openSku = $state(null);
  let photoGate = $state(false);
  let formPhoto = $state(null);
  let wraps = $state([]); // card host elements — for pinning the long-press menu below its card

  function closeDetail() { detailGroup = null; openSku = null; }
  function openAdd() {
    editing = null;
    formPhoto = null;
    showForm = true;
    buzz(8);
  }
  /* photo-first: the camera asks before the form does */
  function openAddFlow() {
    photoGate = true;
    buzz(8);
  }
  async function gatePhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      formPhoto = await fileToPhotoDataUrl(f, 640);
      photoGate = false;
      openAdd();
    } catch { toastErr('تعذّرت قراءة الصورة'); }
  }
  function gateSkip() {
    photoGate = false;
    formPhoto = null;
    openAdd();
  }
  function openEdit(p) {
    editing = p;
    formPhoto = null;
    closeDetail();
    showForm = true;
    buzz(8);
  }

  /* ---- Floating action menu ---- */
  const dialActions = [
    { id: 'add', label: 'إضافة موديل', icon: 'plus' },
    { id: 'invoice', label: 'فاتورة وارد', icon: 'upload' }
  ];
  function onDial(a) {
    if (a.id === 'add') openAddFlow();
    if (a.id === 'invoice') goto('receive');
  }

  /* ---- Long-press power moves: menu fixed below the selected card,
          everything else behind a soft blur veil ---- */
  let quickOps = $state(null); // { g, top }

  function onLongPress(e, g, node) {
    const r = node?.getBoundingClientRect?.();
    const below = r ? Math.min(r.bottom + 8, window.innerHeight - 190) : window.innerHeight / 3;
    buzz([18, 40, 18]);
    quickOps = { g, top: Math.max(below, 70) };
  }
  /* delete a whole model (all its colors & sizes) — from the card, long-press menu, or detail sheet */
  async function askDelete(g) {
    buzz(10);
    const ok = await askConfirm({
      title: `حذف «${g.name}»؟`,
      body: `يُحذف الموديل بكل ألوانه ومقاساته (${fmtNum(g.items.length)} بطاقة • ${fmtNum(g.qty)} قطعة) نهائياً.`,
      okLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    await deleteProducts(g.items.map((x) => x.sku));
    if (detailGroup && detailGroup.key === g.key) closeDetail();
    quickOps = null;
    toastOk(`حُذف «${g.name}» من المخزون`);
  }
  function qoDetails() {
    const g = quickOps.g;
    quickOps = null;
    closeDetail();
    detailGroup = g;
  }
  function qoEdit() {
    const g = quickOps.g;
    quickOps = null;
    openEdit(g.lead);
  }
  /* restock this model via فاتورة وارد — one line per color, holes pre-set to 2 */
  function qoRestock() {
    const g = quickOps ? quickOps.g : detailGroup;
    quickOps = null;
    invoicePreset.set({
      supplier: g.supplier || '',
      lines: g.colorRows.map((cr) => {
        const sizes = {};
        for (const sz of cr.sizes) if (sz.qty === 0) sizes[sz.size] = 2;
        return {
          name: g.name, category: g.category, type: g.type || '', season: g.season || '',
          material: g.material || '', color: cr.color,
          cost: g.lead.cost, price: g.price, sizes, photo: cr.sizes.find((s) => s.p?.photo)?.p?.photo || g.photo,
          modelId: g.lead.modelId
        };
      })
    });
    goto('receive');
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="search" radius="var(--r-md)">
    <Icon name="search" size={18} color="var(--taupe)" />
    <input placeholder="ابحث بالاسم، اللون، المقاس، الكود…" bind:value={f.q} />
    {#if f.q}<button class="clr" onclick={() => (f.q = '')}><Icon name="x" size={14} /></button>{/if}
  </Glass>

  <!-- Premium filter card — collapsed until needed; values stay untouched -->
  <Glass class="filter-card">
    <div class="f-head">
      <button class="f-title f-toggle" aria-expanded={fOpen} onclick={() => { fOpen = !fOpen; buzz(6); }}>
        <Icon name="sliders" size={16} color="var(--burgundy)" /> فلاتر
        <span class="f-chev" class:open={fOpen}><Icon name="back" size={13} color="var(--taupe)" /></span>
      </button>
      {#if activeCount > 0}<span class="f-count">{activeCount}</span>{/if}
      <span class="f-spacer"></span>
      {#if fOpen && !isDefault}
        <button class="f-clear" onclick={clearAllFilters}>مسح الكل</button>
      {/if}
    </div>

    {#if fOpen}
      <div class="f-row">
        <Dropdown bind:value={f.cat} options={cats} icon="tag" placeholder="التصنيف: الكل" />
        <Dropdown bind:value={f.typ} options={types} icon="list" placeholder="النوع: الكل" />
      </div>
      <div class="f-row">
        <Dropdown bind:value={f.season} options={seasons} icon="calendar" placeholder="الموسم: الكل" />
        <Dropdown bind:value={f.availInv} options={AVAIL} icon="box" placeholder="الحالة: الكل" />
        <Dropdown bind:value={f.sort} options={SORTS} icon="sparkle" placeholder="ترتيب: الأحدث" />
      </div>
    {:else if activeTags.length}
      <!-- collapsed but filtered: the active tags stay visible and removable -->
      <div class="f-active">
        {#each activeTags as t (t.key)}
          <span class="f-tag">
            {t.label}
            <button aria-label="إزالة {t.label}" onclick={() => removeTag(t.key)}><Icon name="x" size={11} /></button>
          </span>
        {/each}
      </div>
    {/if}
  </Glass>

  <div class="muted small sort-note">
    {fmtNum(totalModels)} موديل{f.cat !== 'الكل' ? ` في ${f.cat}` : ''} — كل بطاقة تجمع مقاسات الموديل وألوانه
  </div>

  {#if sorted.length === 0}
    <EmptyState
      title={isDefault ? 'المخزون فارغ' : 'لا نتائج مطابقة'}
      subtitle={isDefault ? 'أضيفي أول حذاء الآن — العملية لا تستغرق إلا ثوانٍ' : 'الموديلات موجودة لكن الفلاتر الحالية تخفيها'}
      actionLabel={isDefault ? 'إضافة موديل' : 'عرض الكل'}
      onaction={isDefault ? openAddFlow : clearAllFilters}
      icon={isDefault ? 'box' : 'search'}
    />
  {:else}
    <div class="grid">
      {#each sorted as g, i (g.key + g.items.length)}
        <div class="cardwrap" class:lit={quickOps && quickOps.g.key === g.key} bind:this={wraps[i]}>
          <Glass
            as="button"
            class="card rise"
            style="animation-delay:{Math.min(i * 0.04, 0.4)}s"
            onlongpress={(e) => onLongPress(e, g, wraps[i])}
            onclick={() => { buzz(6); closeDetail(); detailGroup = g; }}
          >
            <!-- الصورة هي الهوية: إطار مربع بعرض البطاقة، بدون اسم -->
            <div class="thumb" class:oos={g.qty === 0}>
              {#if g.photo}
                <img src={g.photo} alt={g.type || g.category} loading="lazy" />
              {:else}
                <Icon name="image" size={34} color="var(--taupe)" />
              {/if}
              {#if g.qty === 0}<span class="oos-flag">نفد</span>{/if}
            </div>
            <div class="card-body">
              {#if g.colorRows.some((cr) => cr.color)}
                <div class="card-colors">
                  {#each g.colorRows as cr (cr.color)}
                    <span class="cc-item" title="{cr.color} — {fmtNum(cr.qty)} قطعة">
                      <i class="cc-dot" style="background:{hexForColor(cr.color, opts.colors)}"></i>
                      <b>{fmtNum(cr.qty)}</b>
                    </span>
                  {/each}
                </div>
              {/if}
              {#if g.type}<div class="card-type">{g.type}</div>{/if}
              <div class="card-sizes muted">
                <span class="sz-label">القياسات المتوفر:</span>
                {g.colorRows.flatMap((c) => c.sizes.filter((s) => s.qty > 0).map((s) => s.size)).join('، ') || '—'}
              </div>
            </div>
            <div class="card-price">{fmtIQD(g.price)}</div>
          </Glass>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Long-press quick menu: fixed below the selected card, the rest of the
     screen behind a shared-blur veil (only card + menu stay clear) -->
{#if quickOps}
  <div class="qp-backdrop" onclick={() => (quickOps = null)} aria-hidden="true"></div>
  <div class="quickops pop" style="top:{quickOps.top}px">
    <div class="qo-row">
      <button class="qo-btn" onclick={qoDetails}><Icon name="list" size={15} /> تفصيل</button>
      <button class="qo-btn gold" onclick={qoRestock}><Icon name="upload" size={15} /> استلام</button>
    </div>
    <div class="qo-row">
      <button class="qo-btn" onclick={qoEdit}><Icon name="edit" size={15} /> تعديل</button>
      <button class="qo-btn danger" onclick={() => askDelete(quickOps.g)}><Icon name="trash" size={15} /> حذف</button>
    </div>
  </div>
{/if}

<SpeedDial actions={dialActions} onselect={onDial} label="إجراءات المخزون" />

<!-- Photo-first gate: snap the shoe, the photo rides the whole form -->
<Sheet open={photoGate} title="صوّري الموديل أولاً" onclose={gateSkip}>
  <div class="stack" style="gap:14px; text-align:center">
    <div class="muted small">صورة الحذاء تعرفين بيها الموديل بعدين — تنتقل معك عبر كل خطوات الإضافة</div>
    <label class="gate-cam">
      <Icon name="image" size={34} color="var(--burgundy)" />
      <span class="bold">افتحي الكاميرا</span>
      <span class="muted tiny">أو المعرض على الهاتف</span>
      <input type="file" accept="image/*" capture="environment" style="display:none" onchange={gatePhoto} />
    </label>
    <button class="btn block" onclick={gateSkip}>بدون صورة</button>
  </div>
</Sheet>

<Sheet open={showForm} title={editing ? 'تعديل موديل' : 'إضافة موديل جديد'} onclose={() => { showForm = false; editing = null; }}>
  <ProductForm product={editing} photo={formPhoto} ondone={() => { showForm = false; editing = null; formPhoto = null; }} />
</Sheet>

<!-- Model sheet: everything about the model — colors × size-run → tap a size for its SKU -->
<Sheet open={!!detailGroup} title={openSku ? 'تفاصيل القطعة' : 'الموديل كامل'} onclose={closeDetail}>
  {#if openSku}
    <ItemDetail product={openSku} onedit={openEdit} ongoto={goto} onclose={() => (openSku = null)} />
  {:else if detailGroup}
    {@const g = detailGroup}
    <div class="stack" style="gap:12px">
      <!-- الصورة هي الهوية: بلا اسم، النوع والتصنيف فقط -->
      <Glass class="mv-head">
        <div class="mv-thumb" class:oos={g.qty === 0}>
          {#if g.photo}<img src={g.photo} alt={g.type || g.category} />{:else}<Icon name="image" size={30} color="var(--taupe)" />{/if}
        </div>
        <div class="mv-info">
          {#if g.type}<div class="mv-type">{g.type}</div>{/if}
          <div class="muted small">{[g.category, g.season, g.material].filter(Boolean).join(' • ')}</div>
          <div class="mv-stats">
            <span class="money" style="color:var(--burgundy)">{fmtIQD(g.price)}</span>
            <span class="mv-qty" class:zero={g.qty === 0}>{fmtNum(g.qty)} قطعة</span>
          </div>
          {#if g.supplier}<div class="mv-sup"><Icon name="upload" size={11} /> من {g.supplier}</div>{/if}
        </div>
      </Glass>

      {#each g.colorRows as cr (cr.color)}
        <div class="mv-color">
          <div class="mvc-head">
            <i class="mvc-dot" style="background:{hexForColor(cr.color, opts.colors)}"></i>
            <span class="bold">{cr.color || 'بدون لون'}</span>
            <span class="muted small">{fmtNum(cr.qty)} قطعة</span>
          </div>
          <div class="mvc-sizes">
            {#each cr.sizes as sz (sz.size + sz.p.sku)}
              <button class="szchip" class:hole={sz.qty === 0} onclick={() => { buzz(6); openSku = sz.p; }}>
                {sz.size}<b>{sz.qty || '—'}</b>
              </button>
            {/each}
          </div>
        </div>
      {/each}

      <div class="row" style="gap:10px">
        <button class="btn gold" style="flex:1" onclick={qoRestock}><Icon name="upload" size={16} /> استلام مقاسات</button>
        <button class="btn" style="flex:1" onclick={() => openEdit(g.lead)}><Icon name="edit" size={16} /> تعديل</button>
      </div>
      <button class="btn danger block" onclick={() => askDelete(g)}><Icon name="trash" size={16} /> حذف الموديل نهائياً</button>
    </div>
  {/if}
</Sheet>

<style>
  :global(.search) {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 50px;
    border-radius: var(--r-md);
  }
  :global(.search) input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .clr { background: none; border: none; color: var(--taupe); cursor: pointer; padding: 4px; }
  .f-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .f-row > :global(.dd) { flex: 1 1 calc(50% - 8px); min-width: 0; }
  .sort-note { margin-top: -4px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr); /* بطاقتان جنباً إلى جنب دائماً */
    gap: 14px;
  }
  .cardwrap { position: relative; min-width: 0; }
  /* البطاقة المحددة تبقى واضحة فوق الحجاب الضبابي */
  .cardwrap.lit { z-index: 71; }
  :global(.card) {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.card:active) { transform: scale(0.97); }
  .thumb {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1; /* الإطار المربع للصورة */
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.06));
    border-bottom: 1px solid var(--line);
    overflow: hidden;
  }
  .thumb.oos { opacity: 0.75; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .oos-flag {
    position: absolute;
    bottom: 8px;
    left: 8px;
    font-size: 10.5px;
    font-weight: 800;
    color: #fff;
    background: rgba(122, 46, 58, 0.92);
    border-radius: 999px;
    padding: 3px 10px;
  }
  .card-body { padding: 10px 12px 6px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .card-colors { display: flex; flex-wrap: wrap; gap: 6px; }
  .cc-item { display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; }
  .cc-dot { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; }
  .cc-item b { color: var(--ink-2); font-weight: 800; font-size: 10.5px; }
  .card-type { font-weight: 800; font-size: 13.5px; color: var(--ink); }
  .card-sizes { font-size: 10.5px; line-height: 1.6; }
  .sz-label { font-weight: 800; color: var(--taupe); }
  .card-price {
    margin: 6px 12px 12px;
    border-top: 1px solid var(--line);
    padding-top: 9px;
    text-align: center;
    font-weight: 800;
    font-size: 14.5px;
    color: var(--burgundy);
  }

  /* model sheet */
  :global(.mv-head) { display: flex; gap: 12px; padding: 12px; align-items: center; }
  .mv-type { font-weight: 800; font-size: 16px; color: var(--ink); }
  .mv-thumb {
    width: 76px; height: 76px; border-radius: var(--r-md); flex: none;
    overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.06));
    border: 1px solid var(--line);
  }
  .mv-thumb.oos { opacity: 0.75; }
  .mv-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .mv-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mv-stats { display: flex; align-items: baseline; gap: 10px; margin-top: 2px; }
  .mv-qty { font-size: 12px; font-weight: 800; color: var(--good); }
  .mv-qty.zero { color: var(--burgundy-deep); }
  .mv-sup {
    display: inline-flex; align-items: center; gap: 4px; margin-top: 2px;
    font-size: 10.5px; font-weight: 800; color: #8a6a35;
  }
  .mv-color { }
  .mvc-head { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
  .mvc-dot { width: 14px; height: 14px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; }
  .mvc-head .muted { margin-inline-start: auto; }
  .mvc-sizes { display: flex; flex-wrap: wrap; gap: 6px; }
  .szchip {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: inherit; font-size: 12px; font-weight: 800;
    color: var(--ink);
    background: rgba(78, 138, 95, 0.12);
    border: 1px solid rgba(78, 138, 95, 0.3);
    border-radius: 10px; padding: 6px 10px;
    cursor: pointer;
    transition: transform 0.13s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .szchip:active { transform: scale(0.9); }
  .szchip b { color: var(--good); }
  .szchip.hole {
    background: rgba(122, 46, 58, 0.06);
    border: 1.5px dashed rgba(122, 46, 58, 0.45);
    color: var(--burgundy-deep);
  }
  .szchip.hole b { color: var(--burgundy); }

  .qp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(252, 243, 238, 0.45);
    backdrop-filter: blur(14px) saturate(1.2);
    -webkit-backdrop-filter: blur(14px) saturate(1.2);
    animation: veil-in 0.2s ease-out;
  }
  @keyframes veil-in { from { opacity: 0; } to { opacity: 1; } }
  .quickops {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    z-index: 71;
    background: var(--glass-strong);
    backdrop-filter: blur(26px) saturate(1.5);
    -webkit-backdrop-filter: blur(26px) saturate(1.5);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    box-shadow: 0 18px 44px rgba(58, 26, 32, 0.28);
    padding: 10px;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .qo-row { display: flex; gap: 6px; }
  .qo-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.6);
    border-radius: 10px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 800;
    color: var(--ink);
    padding: 8px 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .qo-btn.gold {
    background: linear-gradient(150deg, var(--gold), #a4803e);
    color: #fff;
    border: none;
  }
  .qo-btn.danger {
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    color: #fff;
    border: none;
  }

  .gate-cam {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    width: 100%;
    padding: 26px 16px;
    border-radius: var(--r-md);
    border: 2px dashed rgba(181, 73, 91, 0.4);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.55), rgba(181, 73, 91, 0.05));
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .gate-cam:active { transform: scale(0.97); }
</style>
