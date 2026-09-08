<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import ProductForm from './ProductForm.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import { db } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';

  let { goto } = $props();

  let products = $state([]);
  let q = $state('');
  let cat = $state('الكل');
  let sort = $state('new');

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

  const cats = $derived(['الكل', ...new Set(products.map((p) => p.category))]);

  const filtered = $derived.by(() => {
    let list = products;
    if (cat !== 'الكل') list = list.filter((p) => p.category === cat);
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
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="gap:10px">
    <div class="search glass">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث بالاسم، اللون، المقاس، الكود…" bind:value={q} />
      {#if q}<button class="clr" onclick={() => (q = '')}><Icon name="x" size={14} /></button>{/if}
    </div>
    <button
      class="iconbtn"
      style="width:50px; height:50px; flex:none"
      aria-label="ترتيب"
      onclick={() => { buzz(6); sort = sort === 'new' ? 'price' : sort === 'price' ? 'qty' : 'new'; }}
    >
      <Icon name="list" size={20} />
    </button>
  </div>

  <div class="cats noscroll">
    {#each cats as c (c)}
      <button class="chip" class:on={cat === c} onclick={() => { buzz(5); cat = c; }}>{c}</button>
    {/each}
  </div>

  <div class="muted small sort-note">
    ترتيب: {sort === 'new' ? 'الأحدث' : sort === 'price' ? 'الأعلى سعراً' : 'الكمية'} • {fmtNum(filtered.length)} موديل
  </div>

  {#if filtered.length === 0}
    <div class="glass rise empty">
      <div class="empty-ic floaty"><Icon name="box" size={34} color="var(--burgundy)" /></div>
      <h2 class="h2">{q || cat !== 'الكل' ? 'لا نتائج مطابقة' : 'المخزون فارغ'}</h2>
      <p class="muted center">
        {q || cat !== 'الكل' ? 'جرّب كلمة أخرى أو غيّر التصنيف' : 'أضف أول حذاء الآن — العملية لا تستغرق إلا ثوانٍ'}
      </p>
      {#if !q && cat === 'الكل'}
        <button class="btn primary lg" onclick={openAdd}><Icon name="plus" size={18} /> إضافة موديل</button>
      {/if}
    </div>
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
  .cats { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
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
