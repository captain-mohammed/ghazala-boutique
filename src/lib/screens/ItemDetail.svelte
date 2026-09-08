<script>
  import Icon from '../components/Icon.svelte';
  import { db, adjustQty, deleteProduct } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz } from '../utils.js';
  import { toastOk, askConfirm, celebrateAt } from '../store.js';

  let { product, onedit = () => {}, onclose = () => {} } = $props();

  let p = $state(product);
  let moves = $state([]);

  $effect(() => {
    p = product;
    const sku = product?.sku;
    if (sku) {
      db.movements.where('sku').equals(sku).reverse().toArray().then((m) => (moves = m.slice(0, 12)));
    }
  });

  const profit = $derived((p?.price || 0) - (p?.cost || 0));

  async function bump(delta) {
    const q = await adjustQty(p.sku, delta);
    p = { ...p, qty: q };
    buzz(10);
    if (delta > 0) celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '📦');
    toastOk(delta > 0 ? `+${delta} قطعة` : `−${Math.abs(delta)} قطعة`);
  }

  async function del() {
    const ok = await askConfirm({
      title: 'حذف الموديل؟',
      body: 'سيُحذف من المخزون نهائياً. سجل الحركات القديم سيبقى محفوظاً.',
      okLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    await deleteProduct(p.sku);
    toastOk('تم الحذف');
    onclose();
  }
</script>

<div class="stack" style="gap:14px">
  <div class="head glass">
    <div class="thumb">
      {#if p.photo}
        <img src={p.photo} alt={p.name} />
      {:else}
        <Icon name="box" size={40} color="var(--taupe)" />
      {/if}
    </div>
    <div class="info">
      <h2 class="h2">{p.name}</h2>
      <div class="muted small">
        {p.category}{p.type ? ' • ' + p.type : ''}{p.color ? ' • ' + p.color : ''}{p.size ? ' • مقاس ' + p.size : ''}
      </div>
      <div class="sku">{p.sku}</div>
    </div>
  </div>

  <div class="grid2">
    <div class="cell glass"><span class="muted small">سعر البيع</span><div class="money">{fmtIQD(p.price)}</div></div>
    <div class="cell glass"><span class="muted small">التكلفة</span><div class="money">{fmtIQD(p.cost)}</div></div>
    <div class="cell glass">
      <span class="muted small">الربح للقطعة</span>
      <div class="money" style="color:{profit >= 0 ? 'var(--good)' : 'var(--burgundy)'}">{fmtIQD(profit)}</div>
    </div>
    <div class="cell glass">
      <span class="muted small">الكمية الحالية</span>
      <div class="money" style="color:{p.qty === 0 ? 'var(--burgundy-deep)' : 'var(--ink)'}">{fmtNum(p.qty)}</div>
    </div>
  </div>

  <div class="row" style="gap:10px">
    <button class="btn" style="flex:1" onclick={() => bump(-1)}>
      <Icon name="back" size={16} style="transform:rotate(90deg)" /> نقصان
    </button>
    <button class="btn" style="flex:1" onclick={() => bump(+1)}>
      <Icon name="plus" size={16} /> زيادة
    </button>
  </div>
  <div class="row" style="gap:10px">
    <button class="btn primary" style="flex:1" onclick={() => { buzz(8); onedit(p); }}>
      <Icon name="edit" size={16} /> تعديل
    </button>
    <button class="btn danger" style="flex:1" onclick={del}>
      <Icon name="trash" size={16} /> حذف
    </button>
  </div>

  {#if moves.length}
    <div class="glass moves">
      <h3 class="h3"><Icon name="history" size={16} /> سجل الحركات</h3>
      <div class="stack" style="gap:8px">
        {#each moves as m, i (m.id)}
          <div class="move pop" style="animation-delay:{i * 0.05}s">
            <span class="m-ic" class:in={m.type === 'in'} class:out={m.type === 'out'}>
              <Icon name={m.type === 'in' ? 'plus' : 'back'} size={14} />
            </span>
            <div class="a-body">
              <div class="bold small">{m.type === 'in' ? 'إدخال' : 'إخراج'} — {fmtNum(m.qty)} قطعة</div>
              <div class="muted" style="font-size:11px">{m.note} • {fmtDate(m.date)}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .head { display: flex; gap: 12px; padding: 12px; align-items: center; }
  .thumb {
    width: 84px; height: 84px;
    border-radius: var(--r-md);
    overflow: hidden;
    flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.08));
    border: 1px solid var(--line);
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sku {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    color: var(--gold);
    background: var(--gold-soft);
    padding: 2px 8px;
    border-radius: 999px;
  }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cell { padding: 10px 14px; border-radius: var(--r-md); display: flex; flex-direction: column; gap: 2px; }
  .moves { padding: 14px; }
  .h3 { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 14.5px; color: var(--ink); }
  .move { display: flex; gap: 10px; align-items: center; }
  .m-ic {
    flex: none; width: 28px; height: 28px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
  }
  .m-ic.in { background: rgba(78, 138, 95, 0.14); color: var(--good); }
  .m-ic.out { background: var(--accent-soft); color: var(--burgundy); }
</style>
