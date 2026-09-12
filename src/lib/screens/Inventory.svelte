<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import SpeedDial from '../components/SpeedDial.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import ProductForm from './ProductForm.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import { db, modelOptions, hexForColor, deleteProducts, modelGroupKey, subsOfType, subsOfType2, subsOfType3, countUnderType, typeChain, seasonsOf } from '../db.js';
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

  /* نوع ذو شجرة: بوت ← كعب عالي ← جيب جانبي… — كل مستوى بصف مستأنف في القائمة */
  /* بادئة صامتة لكل مستوى (محارف صفرية العرض) — الفحص دائماً الأطول أولاً */
  const TYPE_SEP = '\u200b', TYPE_SEP2 = '\u200b\u200b', TYPE_SEP3 = '\u200b\u200b\u200b';
  /* كل مستوى يُحسب **داخل أبويه** — «كعب عالي» تحت بوت لا تلقط أصناف نوع «كعب عالي» الرئيسي */
  const typeRows = $derived.by(() => {
    const rows = [];
    for (const t of opts.types) {
      rows.push({ value: t, label: t, icon: 'list', count: countUnderType(products, { type: t }) });
      for (const st of subsOfType(opts.typeSubs, t)) {
        rows.push({ value: TYPE_SEP + st, label: '↳ ' + st, icon: 'list', count: countUnderType(products, { type: t, typeSub: st }) });
        for (const st2 of subsOfType2(opts.typeSubs2, t, st)) {
          rows.push({ value: TYPE_SEP2 + st2, label: '↳ ' + st2, icon: 'list', count: countUnderType(products, { type: t, typeSub: st, typeSub2: st2 }) });
          for (const st3 of subsOfType3(opts.typeSubs3, t, st, st2))
            rows.push({ value: TYPE_SEP3 + st3, label: '↳ ' + st3, icon: 'list', count: countUnderType(products, { type: t, typeSub: st, typeSub2: st2, typeSub3: st3 }) });
        }
      }
    }
    return rows;
  });
  /* المقاسات المتوفرة للموديل كله — بلا تكرار بين الألوان */
  const allSizes = (g) =>
    [...new Set(g.colorRows.flatMap((c) => c.sizes.filter((s) => s.qty > 0).map((s) => s.size)))].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  const matchType = (p, tv) => {
    if (String(tv).startsWith(TYPE_SEP3)) return p.typeSub3 === tv.slice(3) && !!p.typeSub2;
    if (String(tv).startsWith(TYPE_SEP2)) return p.typeSub2 === tv.slice(2) && !!p.typeSub;
    if (String(tv).startsWith(TYPE_SEP)) return p.typeSub === tv.slice(1) && !!p.type;
    return p.type === tv;
  };
  const cats = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.length, clear: true },
    ...[...new Set(products.map((p) => p.category))].map((c) => ({ value: c, label: c, icon: 'tag', count: products.filter((p) => p.category === c).length }))
  ]);
  const types = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.type).length, clear: true },
    ...typeRows
  ]);
  const seasons = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => seasonsOf(p).length).length, clear: true },
    ...opts.seasons.map((s) => ({ value: s, label: s, icon: 'calendar', count: products.filter((p) => seasonsOf(p).includes(s)).length }))
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
    if (f.typ !== 'الكل') list = list.filter((p) => matchType(p, f.typ));
    if (f.season !== 'الكل') list = list.filter((p) => seasonsOf(p).includes(f.season));
    if (f.q.trim()) {
      const s = f.q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.color, p.sku, p.size, p.barcode, p.type, seasonsOf(p).join(' '), p.material].filter(Boolean).join(' ').toLowerCase().includes(s)
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
      /* سلسلة النوع من كل قطع الموديل — قد تحمل القطع تفاصيل مختلفة */
      const subsAll = [...new Set(items.map((x) => x.typeSub).filter(Boolean))];
      const subs2All = [...new Set(items.map((x) => x.typeSub2).filter(Boolean))];
      const subs3All = [...new Set(items.map((x) => x.typeSub3).filter(Boolean))];
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
        type: lead.type, typeSub: lead.typeSub || subsAll[0] || '', typeSub2: lead.typeSub2 || subs2All[0] || '', typeSub3: lead.typeSub3 || subs3All[0] || '',
        subsAll, subs2All, subs3All,
        seasons: [...new Set(items.flatMap((x) => seasonsOf(x)))],
        material: lead.material,
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
  let formPhoto = $state(null);
  let wraps = $state([]); // card host elements — for pinning the long-press menu below its card

  /* جدار الصور: تصفح الصور أولاً — ثلاث بطاقات بالصف، النوع والسعر رقاقة */
  let wall = $state(localStorage.getItem('ghazala.inv.wall') === '1');
  function toggleWall() {
    wall = !wall;
    try { localStorage.setItem('ghazala.inv.wall', wall ? '1' : '0'); } catch { /* noop */ }
    buzz(8);
  }

  function closeDetail() { detailGroup = null; openSku = null; }
  function openAdd() {
    editing = null;
    formPhoto = null;
    showForm = true;
    buzz(8);
  }
  /* الصورة إجبارية داخل الفورم نفسه — لا بوابة وسيطة */
  const openAddFlow = openAdd;
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
  ];  function onDial(a) {
    if (a.id === 'add') openAddFlow();
    if (a.id === 'invoice') goto('receive');
  }

  /* ---- Long-press power moves: menu fixed below the selected card,
          everything else behind a soft blur veil ---- */
  let quickOps = $state(null); // { g, top, left } — pinned centered under its card

  function onLongPress(e, g, node) {
    const r = node?.getBoundingClientRect?.();
    if (!r) { quickOps = { g, top: window.innerHeight / 3, left: window.innerWidth / 2 }; buzz([18, 40, 18]); return; }
    /* CENTER of the card — the menu never drifts: it opens centered below,
       clamped to stay fully on screen (18px margins, menu ≈ 230px wide). */
    const cx = r.left + r.width / 2;
    const halfW = 115; // ~half of the 230px menu
    const left = Math.max(halfW + 10, Math.min(window.innerWidth - halfW - 10, cx));
    const estH = 118;
    let top = r.bottom + 8;
    if (top + estH > window.innerHeight - 14) top = Math.max(64, r.top - estH - 8); // flip above if no room
    buzz([18, 40, 18]);
    quickOps = { g, top, left };
  }
  /* delete a whole model (all its colors & sizes) — from the card, long-press menu, or detail sheet */
  async function askDelete(g) {
    buzz(10);
    const ok = await askConfirm({
      title: `حذف «${g.name}»؟`,
      body: `يُحذف الموديل بكل ألوانه ومقاساته (${fmtNum(g.items.length)} بطاقة - ${fmtNum(g.qty)} قطعة) نهائياً.`,
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
          name: g.name, category: g.category, type: g.type || '', typeSub: g.typeSub || '', typeSub2: g.typeSub2 || '', typeSub3: g.typeSub3 || '', season: g.season || '',
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

  <div class="sort-row">
    <div class="muted small sort-note">
      {fmtNum(totalModels)} موديل{f.cat !== 'الكل' ? ` في ${f.cat}` : ''} — كل بطاقة تجمع مقاسات الموديل وألوانه
    </div>
    <button type="button" class="chip" class:on={wall} onclick={toggleWall} title="جدار الصور">
      <Icon name="image" size={12} /> جدار الصور
    </button>
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
    <div class="grid" class:wall={wall}>
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
              <!-- النفد أو الكمية: شارة وسيطة أسفل الصورة -->
              {#if g.qty === 0}
                <span class="thumb-badge oos">نفد</span>
              {:else}
                <span class="thumb-badge">{fmtNum(g.qty)}</span>
              {/if}
              {#if wall}<span class="wall-price">{fmtIQD(g.price)}</span>{/if}
            </div>
            {#if !wall}
            <div class="card-body">
              <!-- النوع بعرض البطاقة كاملاً أسفل الصورة مباشرة -->
              {#if g.type || g.typeSub || g.typeSub2 || g.typeSub3}<div class="card-type">{[g.type, ...g.subsAll, ...g.subs2All, ...g.subs3All].filter(Boolean).join(' - ')}</div>{/if}
              <!-- الصف: القياسات يميناً والدوائر يساراً -->
              <div class="card-mid">
                <div class="card-sizes-box">
                  <span class="sz-label">القياسات المتوفر:</span>
                  <div class="sz-flow">
                    {#each allSizes(g).slice(0, 5) as sz (String(sz))}
                      <span class="sz-chip">{sz}</span>
                    {/each}
                    {#if allSizes(g).length > 5}<span class="sz-more">+{fmtNum(allSizes(g).length - 5)}</span>{/if}
                    {#if !allSizes(g).length}<span class="sz-chip empty">—</span>{/if}
                  </div>
                </div>
                {#if g.colorRows.some((cr) => cr.color)}
                  <div class="card-colors">
                    {#each g.colorRows.filter((cr) => cr.qty > 0).slice(0, 6) as cr (cr.color)}
                      <span class="cc-item" title="{cr.color} — {fmtNum(cr.qty)} قطعة">
                        <i class="cc-dot" style="background:{hexForColor(cr.color, opts.colors)}"></i>
                        <b class="cc-qty">{fmtNum(cr.qty)}</b>
                      </span>
                    {/each}
                    {#if g.colorRows.filter((cr) => cr.qty > 0).length > 6}
                      <span class="cc-item"><span class="cc-more">+{fmtNum(g.colorRows.filter((cr) => cr.qty > 0).length - 6)}</span></span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="card-price">{fmtIQD(g.price)}</div>
            {/if}
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
  <div class="quickops" style="top:{quickOps.top}px; left:{quickOps.left}px">
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
          {#if g.type || g.typeSub || g.typeSub2 || g.typeSub3}<div class="mv-type">{typeChain(g)}</div>{/if}
          <div class="muted small">{[g.category, g.seasons.length ? g.seasons.join(' - ') : '', g.material].filter(Boolean).join(' - ')}</div>
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
  .cardwrap { position: relative; min-width: 0; height: 100%; }
  /* البطاقة المحددة تبقى واضحة فوق الحجاب الضبابي */
  .cardwrap.lit { z-index: 71; }
  :global(.card) {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch; /* البطاقة زر — المتصفح يوسّط المحتوى افتراضياً */
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
  /* شارة وسيطة أسفل الصورة: الكمية أو «نفد» */
  .thumb-badge {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    min-width: 26px;
    font-size: 11px;
    font-weight: 800;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 3px 10px;
    box-shadow: 0 2px 8px rgba(58, 26, 32, 0.14);
    font-variant-numeric: tabular-nums;
  }
  .thumb-badge.oos {
    color: #fff;
    background: rgba(122, 46, 58, 0.92);
    border-color: transparent;
    letter-spacing: 0.5px;
  }
  /* جسم البطاقة: ارتفاع مثبت — لا تمدد أبداً مهما كثر المحتوى */
  .card-body { height: 122px; padding: 9px 12px 4px; display: flex; flex-direction: column; gap: 7px; flex: none; overflow: hidden; }
  /* النوع بعرض البطاقة أسفل الصورة */
  .card-type { font-weight: 800; font-size: 13.5px; color: var(--ink); width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; }
  /* الصف الأوسط: القياسات يميناً (مرن) والدوائر يساراً (ثابتة) */
  .card-mid { flex: 1; min-height: 0; display: flex; gap: 12px; }
  /* الدوائر: ثلاثة بكل صف، ملتصقة بيسار البطاقة دائماً */
  .card-colors {
    flex: none;
    margin-right: auto; /* يدفع الصندوق لأقصى اليسار مهما كان عدد الدوائر */
    display: grid;
    grid-template-columns: repeat(3, auto);
    align-content: start;
    gap: 7px 8px;
    min-height: 0;
    overflow: hidden;
  }
  .cc-more {
    width: 20px; height: 20px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 800; color: var(--burgundy);
    background: rgba(181, 73, 91, 0.1);
  }
  .cc-item { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
  .cc-dot { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; box-shadow: 0 1px 4px rgba(58, 26, 32, 0.12); }
  .cc-qty { color: var(--ink-2); font-weight: 800; font-size: 10px; line-height: 1; font-variant-numeric: tabular-nums; }
  /* حاوية القياسات: بلا حدود ظاهرة — تثبّت المساحة فقط */
  .card-sizes-box {
    flex: 0 1 auto; /* لا تلتقط المساحة الحرة —:auto-margin هو اللي يدفع الدوائر لليسار */
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
  }
  .sz-label { font-weight: 800; color: var(--taupe); font-size: 10.5px; }
  .sz-flow { display: flex; flex-wrap: wrap; gap: 3px 4px; align-content: flex-start; overflow: hidden; }
  .sz-chip {
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-2);
    background: rgba(122, 46, 58, 0.06);
    border-radius: 6px;
    padding: 1px 6px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .sz-chip.empty { background: none; color: var(--taupe); }
  .sz-more {
    font-size: 10px;
    font-weight: 800;
    color: var(--burgundy);
    background: rgba(181, 73, 91, 0.1);
    border-radius: 6px;
    padding: 1px 6px;
  }
  /* صف العنوان: العدّاد يميناً ومفتاح جدار الصور يساراً */
  .sort-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  /* جدار الصور: ثلاث بطاقات بالصف — الصورة تتكلم */
  .grid.wall { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .wall-price {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    font-weight: 800;
    color: var(--ink);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 2px 8px rgba(58, 26, 32, 0.12);
  }
  .card-price {
    margin: 8px 12px 12px;
    border-top: 1.5px solid var(--line-2);
    padding-top: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 15.5px;
    color: var(--burgundy);
    letter-spacing: 0.2px;
    flex: none; /* السعر لا ينضغط ولا يتمدد */
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
  /* نفس روح pop لكن مع تثبيت التوسيط — الأنيميشن العام كان يلغي translateX */
  .quickops {
    position: fixed;
    transform: translateX(-50%);
    animation: qo-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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
  @keyframes qo-pop {
    0% { transform: translateX(-50%) scale(0.7); opacity: 0; }
    60% { transform: translateX(-50%) scale(1.06); }
    100% { transform: translateX(-50%) scale(1); opacity: 1; }
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

</style>
