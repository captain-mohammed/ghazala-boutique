<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, adjustQty, deleteProduct, createReservation, RESERVATION_HOURS } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let { product, onedit = () => {}, onclose = () => {} } = $props();

  let reserving = $state(false);
  let rName = $state('');
  let rPhone = $state('');

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

  async function doReserve() {
    try {
      await createReservation({ sku: p.sku, customerName: rName, customerPhone: rPhone });
      reserving = false;
      rName = '';
      rPhone = '';
      const q = await db.products.get(p.sku);
      p = { ...p, qty: q.qty };
      buzz([20, 50, 20]);
      toastOk(`حُجزت القطعة ${RESERVATION_HOURS} ساعة — الكمية ${q.qty}`);
    } catch (e) {
      toastErr(e.message || 'تعذر الحجز');
    }
  }
</script>

<div class="stack" style="gap:14px">
  <Glass class="head">
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
  </Glass>

  <div class="grid2">
    <Glass class="cell" radius="var(--r-md)"><span class="muted small">سعر البيع</span><div class="money">{fmtIQD(p.price)}</div></Glass>
    <Glass class="cell" radius="var(--r-md)"><span class="muted small">التكلفة</span><div class="money">{fmtIQD(p.cost)}</div></Glass>
    <Glass class="cell" radius="var(--r-md)">
      <span class="muted small">الربح للقطعة</span>
      <div class="money" style="color:{profit >= 0 ? 'var(--good)' : 'var(--burgundy)'}">{fmtIQD(profit)}</div>
    </Glass>
    <Glass class="cell" radius="var(--r-md)">
      <span class="muted small">الكمية الحالية</span>
      <div class="money" style="color:{p.qty === 0 ? 'var(--burgundy-deep)' : 'var(--ink)'}">{fmtNum(p.qty)}</div>
    </Glass>
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
    <button class="btn gold" style="flex:1" disabled={p.qty <= 0} onclick={() => { buzz(8); reserving = true; }}>
      <Icon name="clock" size={16} /> حجز لزبونة
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
    <Glass class="moves">
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
    </Glass>
  {/if}
</div>

<Sheet open={reserving} title="حجز قطعة" onclose={() => (reserving = false)}>
  <div class="stack" style="gap:12px">
    <div class="muted small">تُحجز قطعة واحدة من «{p.name}» لمدة {RESERVATION_HOURS} ساعة وتُخصم من المخزون الآن.</div>
    <div class="field">
      <label>اسم الزبونة</label>
      <input class="input" bind:value={rName} placeholder="مثال: زينب" />
    </div>
    <div class="field">
      <label>الهاتف (اختياري)</label>
      <input class="input" bind:value={rPhone} inputmode="tel" placeholder="07xx…" />
    </div>
    <button class="btn primary lg block" onclick={doReserve}>
      <Icon name="clock" size={20} /> تأكيد الحجز
    </button>
  </div>
</Sheet>

<style>
  :global(.head) { display: flex; gap: 12px; padding: 12px; align-items: center; }
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
  :global(.cell) { padding: 10px 14px; border-radius: var(--r-md); display: flex; flex-direction: column; gap: 2px; }
  :global(.moves) { padding: 14px; }
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
