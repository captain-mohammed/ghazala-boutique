<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import SpeedDial from '../components/SpeedDial.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ProductForm from './ProductForm.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import { db } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';

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

  function openAdd() {
    editing = null;
    showForm = true;
    buzz(8);
  }
  function openEdit(p) {
    editing = p;
    detail = null;
    showForm = true;
    buzz(8);
  }

  /* Floating action menu — المزيد قادم لاحقاً (فاتورة وارد، طلبية…) */
  const dialActions = [{ id: 'add', label: 'إضافة موديل', icon: 'plus' }];
  function onDial(a) {
    if (a.id === 'add') openAdd();
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="gap:10px">
    <div class="search glass">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث بالاسم، اللون، المقاس، الكود…" bind:value={q} />
      {#if q}<button class="clr" onclick={() => (q = '')}><Icon name="x" size={14} /></button>{/if}
    </div>
  </div>

  <!-- Premium filter card -->
  <div class="glass filter-card">
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
  </div>

  <div class="muted small sort-note">
    {fmtNum(filtered.length)} موديل{cat !== 'الكل' ? ` في ${cat}` : ''}
  </div>

  {#if filtered.length === 0}
    <EmptyState
      title={isDefault ? 'المخزون فارغ' : 'لا نتائج مطابقة'}
      subtitle={isDefault ? 'أضف أول حذاء الآن — العملية لا تستغرق إلا ثوانٍ' : 'الموديلات موجودة لكن الفلاتر الحالية تخفيها'}
      actionLabel={isDefault ? 'إضافة موديل' : 'عرض الكل'}
      onaction={isDefault ? openAdd : clearAllFilters}
      icon={isDefault ? 'box' : 'search'}
    />
  {:else}
    <div class="grid">
      {#each filtered as p, i (p.sku)}
        <button class="card glass rise" style="animation-delay:{Math.min(i * 0.04, 0.4)}s" onclick={() => { buzz(6); detail = p; }}>
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
        </button>
      {/each}
    </div>
  {/if}
</div>

<SpeedDial actions={dialActions} onselect={onDial} />

<Sheet open={showForm} title={editing ? 'تعديل موديل' : 'إضافة موديل جديد'} onclose={() => { showForm = false; editing = null; }}>
  <ProductForm product={editing} ondone={() => { showForm = false; editing = null; }} />
</Sheet>

<Sheet open={!!detail} title="تفاصيل الموديل" onclose={() => (detail = null)}>
  {#if detail}
    <ItemDetail product={detail} onedit={openEdit} onclose={() => (detail = null)} />
  {/if}
</Sheet>

<style>
  .search {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 50px;
    border-radius: var(--r-md);
  }
  .search input {
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
  .card {
    position: relative;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .card:active { transform: scale(0.97); }
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
</style>
