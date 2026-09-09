<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import SpeedDial from '../components/SpeedDial.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import ProductForm from './ProductForm.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import { db, adjustQty } from '../db.js';
  import { fmtIQD, fmtNum, buzz, fileToPhotoDataUrl } from '../utils.js';
  import { toastOk, toastErr } from '../store.js';

  let { goto } = $props();

  let products = $state([]);
  let q = $state('');
  let cat = $state('الكل');
  let sort = $state('new');
  let avail = $state('all');

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const p = await db.products.toArray();
      if (alive) products = p;
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const cats = $derived.by(() => {
    const set = [...new Set(products.map((p) => p.category))];
    return [
      { value: 'الكل', label: 'الكل', icon: 'dots', count: products.length, clear: true },
      ...set.map((c) => ({ value: c, label: c, icon: 'tag', count: products.filter((p) => p.category === c).length }))
    ];
  });

  const AVAIL = [
    { value: 'all', label: 'الكل', icon: 'dots', clear: true },
    { value: 'in', label: 'متوفر', icon: 'check' },
    { value: 'low', label: 'كمية منخفضة', icon: 'alert' },
    { value: 'out', label: 'نفد', icon: 'x' }
  ];

  const SORTS = [
    { value: 'new', label: 'الأحدث', icon: 'sparkle', clear: true },
    { value: 'price', label: 'الأعلى سعراً', icon: 'tag' },
    { value: 'qty', label: 'الأقل كمية', icon: 'chart' }
  ];

  const isLow = (p) => p.qty > 0 && p.qty <= 3;

  const filtered = $derived.by(() => {
    let list = products;
    if (cat !== 'الكل') list = list.filter((p) => p.category === cat);
    if (avail === 'in') list = list.filter((p) => p.qty >= 4);
    else if (avail === 'low') list = list.filter(isLow);
    else if (avail === 'out') list = list.filter((p) => p.qty === 0);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.color, p.sku, p.size, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(s)
      );
    }
    const sorted = [...list];
    if (sort === 'new') sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === 'price') sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (sort === 'qty') sorted.sort((a, b) => a.qty - b.qty);
    return sorted;
  });

  /* ---- Premium filter bar state ---- */
  const activeCount = $derived((cat !== 'الكل' ? 1 : 0) + (avail !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0) + (q.trim() ? 1 : 0));
  const isDefault = $derived(cat === 'الكل' && avail === 'all' && sort === 'new' && !q.trim());

  function clearAllFilters() {
    cat = 'الكل';
    avail = 'all';
    sort = 'new';
    q = '';
    buzz(10);
  }

  const activeTags = $derived.by(() => {
    const tags = [];
    if (q.trim()) tags.push({ key: 'q', label: `بحث: ${q.trim()}` });
    if (cat !== 'الكل') tags.push({ key: 'cat', label: cat });
    if (avail !== 'all') tags.push({ key: 'avail', label: AVAIL.find((a) => a.value === avail)?.label || '' });
    if (sort !== 'new') tags.push({ key: 'sort', label: `ترتيب: ${SORTS.find((s) => s.value === sort)?.label || ''}` });
    return tags;
  });

  function removeTag(key) {
    if (key === 'q') q = '';
    if (key === 'cat') cat = 'الكل';
    if (key === 'avail') avail = 'all';
    if (key === 'sort') sort = 'new';
    buzz(6);
  }

  let showForm = $state(false);
  let editing = $state(null);
  let detail = $state(null);
  let photoGate = $state(false);
  let formPhoto = $state(null);

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
    detail = null;
    showForm = true;
    buzz(8);
  }

  /* Floating action menu — المزيد قادم لاحقاً (طلبية…) */
  const dialActions = [
    { id: 'add', label: 'إضافة موديل', icon: 'plus' },
    { id: 'invoice', label: 'فاتورة وارد', icon: 'upload' }
  ];
  function onDial(a) {
    if (a.id === 'add') openAddFlow();
    if (a.id === 'invoice') goto('receive');
  }

  /* ---- Long-press power moves: hold a card → quick ops popover ---- */
  let quickOps = $state(null); // { sku, x, y }

  function onLongPress(e, p) {
    buzz([18, 40, 18]);
    quickOps = { sku: p.sku, product: p, x: e.detail?.x ?? window.innerWidth / 2, y: e.detail?.y ?? window.innerHeight / 3 };
  }

  async function quickBump(p, d) {
    const q2 = await adjustQty(p.sku, d);
    products = products.map((x) => (x.sku === p.sku ? { ...x, qty: q2 } : x));
    quickOps = null;
    buzz(12);
    if (d > 0) toastOk(`+1 قطعة — ${p.name}`);
    else toastOk(`−1 قطعة — ${p.name}`);
  }

  function quickReserve(p) {
    quickOps = null;
    detail = products.find((x) => x.sku === p.sku);
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="gap:10px">
    <Glass class="search" radius="var(--r-md)">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث بالاسم، اللون، المقاس، الكود…" bind:value={q} />
      {#if q}<button class="clr" onclick={() => (q = '')}><Icon name="x" size={14} /></button>{/if}
    </Glass>
  </div>

  <!-- Premium filter card -->
  <Glass class="filter-card">
    <div class="f-head">
      <span class="f-title"><Icon name="sliders" size={16} color="var(--burgundy)" /> فلاتر</span>
      {#if activeCount > 0}<span class="f-count">{activeCount}</span>{/if}
      <span class="f-spacer"></span>
      {#if !isDefault}
        <button class="f-clear" onclick={clearAllFilters}>مسح الكل</button>
      {/if}
    </div>

    <div class="f-row">
      <Dropdown bind:value={cat} options={cats} icon="tag" placeholder="التصنيف: الكل" />
      <Dropdown bind:value={avail} options={AVAIL} icon="box" placeholder="الحالة: الكل" />
      <Dropdown bind:value={sort} options={SORTS} icon="sparkle" placeholder="ترتيب: الأحدث" />
    </div>

    {#if activeTags.length}
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
    {fmtNum(filtered.length)} موديل{cat !== 'الكل' ? ` في ${cat}` : ''}
  </div>

  {#if filtered.length === 0}
    <EmptyState
      title={isDefault ? 'المخزون فارغ' : 'لا نتائج مطابقة'}
      subtitle={isDefault ? 'أضف أول حذاء الآن — العملية لا تستغرق إلا ثوانٍ' : 'الموديلات موجودة لكن الفلاتر الحالية تخفيها'}
      actionLabel={isDefault ? 'إضافة موديل' : 'عرض الكل'}
      onaction={isDefault ? openAddFlow : clearAllFilters}
      icon={isDefault ? 'box' : 'search'}
    />
  {:else}
    <div class="grid">
      {#each filtered as p, i (p.sku)}
        <Glass
          as="button"
          class="card rise"
          style="animation-delay:{Math.min(i * 0.04, 0.4)}s"
          onlongpress={(e) => onLongPress(e, p)}
          onclick={() => { buzz(6); detail = p; }}
        >
          <div class="thumb" class:oos={p.qty === 0}>
            {#if p.photo}
              <img src={p.photo} alt={p.name} loading="lazy" />
            {:else}
              <Icon name="box" size={30} color="var(--taupe)" />
            {/if}
            <span class="qty-badge" class:zero={p.qty === 0} class:low={p.qty > 0 && p.qty <= 3}>{fmtNum(p.qty)}</span>
          </div>
          <div class="card-body">
            <div class="card-name">{p.name}</div>
            <div class="card-meta">
              <span>{p.color || p.category}{p.size ? ' • ' + p.size : ''}</span>
              <span class="card-price">{fmtIQD(p.price)}</span>
            </div>
          </div>
        </Glass>
      {/each}
    </div>
  {/if}
</div>

<SpeedDial actions={dialActions} onselect={onDial} label="إجراءات المخزون" />

{#if quickOps}
  <div class="qp-backdrop" onclick={() => (quickOps = null)} aria-hidden="true"></div>
  <div class="quickops pop" style="left:{Math.min(Math.max(quickOps.x, 90), window.innerWidth - 90)}px; top:{Math.max(quickOps.y - 8, 60)}px">
    <div class="qo-name">{quickOps.product.name}</div>
    <div class="qo-row">
      <button class="qo-btn" onclick={() => quickBump(quickOps.product, +1)}><Icon name="plus" size={16} /> قطعة</button>
      <button class="qo-btn" onclick={() => quickBump(quickOps.product, -1)}><Icon name="back" size={14} style="transform:rotate(90deg)" /> نقصان</button>
    </div>
    <div class="qo-row">
      <button class="qo-btn gold" onclick={() => quickReserve(quickOps.product)}><Icon name="clock" size={15} /> حجز</button>
      <button class="qo-btn" onclick={() => { const p2 = quickOps.product; quickOps = null; openEdit(p2); }}><Icon name="edit" size={15} /> تعديل</button>
    </div>
  </div>
{/if}

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

<Sheet open={!!detail} title="تفاصيل الموديل" onclose={() => (detail = null)}>
  {#if detail}
    <ItemDetail product={detail} onedit={openEdit} ongoto={goto} onclose={() => (detail = null)} />
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
  .f-row { display: flex; gap: 8px; }
  .f-row > :global(.dd) { flex: 1; min-width: 0; }
  .sort-note { margin-top: -4px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  :global(.card) {
    position: relative;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.card:active) { transform: scale(0.97); }
  .thumb {
    height: 110px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.06));
    border-bottom: 1px solid var(--line);
    position: relative;
  }
  .thumb.oos { background: linear-gradient(150deg, rgba(255, 255, 255, 0.4), rgba(156, 123, 107, 0.12)); opacity: 0.8; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .qty-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    min-width: 26px;
    height: 26px;
    padding: 0 8px;
    border-radius: 999px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(78, 138, 95, 0.9);
    color: #fff;
    font-size: 12.5px;
    font-weight: 800;
    box-shadow: 0 3px 10px rgba(58, 26, 32, 0.18);
  }
  .qty-badge.low { background: rgba(192, 127, 58, 0.9); }
  .qty-badge.zero { background: rgba(122, 46, 58, 0.85); }
  .card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-weight: 800; font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta { font-size: 12px; color: var(--taupe); display: flex; justify-content: space-between; gap: 6px; }
  .card-price { font-weight: 800; color: var(--burgundy); font-size: 13px; white-space: nowrap; }

  .qp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(58, 26, 32, 0.12);
  }
  .quickops {
    position: fixed;
    z-index: 71;
    transform: translate(-50%, -100%);
    background: var(--glass-strong);
    backdrop-filter: blur(26px) saturate(1.5);
    -webkit-backdrop-filter: blur(26px) saturate(1.5);
    border: 1px solid var(--glass-border);
    border-radius: 16px;
    box-shadow: 0 18px 44px rgba(58, 26, 32, 0.28);
    padding: 10px;
    min-width: 170px;
  }
  .qo-name {
    font-size: 12px;
    font-weight: 800;
    color: var(--ink);
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 170px;
  }
  .qo-row { display: flex; gap: 6px; margin-bottom: 6px; }
  .qo-row:last-child { margin-bottom: 0; }
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
