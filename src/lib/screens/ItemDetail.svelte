<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Glass from '../components/Glass.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, adjustQty, deleteProduct, createReservation, RESERVATION_HOURS } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt, invoicePreset } from '../store.js';

  let { product, onedit = () => {}, ongoto = () => {}, onclose = () => {} } = $props();

  let reserving = $state(false);
  let rName = $state('');
  let rPhone = $state('');

  let p = $state(product);
  let moves = $state([]);
  let siblings = $state([]);

  /* نفس الموديل = نفس الرقم الداخلي ونفس اللون (احتياط: الاسم للقديم) */
  const sameModel = (a, b) =>
    a.modelId && b.modelId
      ? a.modelId === b.modelId && (a.color || '').trim() === (b.color || '').trim()
      : a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
        a.category === b.category &&
        (a.color || '').trim() === (b.color || '').trim();

  $effect(() => {
    p = product;
    const sku = product?.sku;
    if (sku) {
      db.movements.where('sku').equals(sku).reverse().toArray().then((m) => (moves = m.slice(0, 12)));
      db.products.toArray().then((ps) => (siblings = ps.filter((x) => sameModel(x, product))));
    }
  });

  /* size-run view: 36[2] 37[—] 38[3] … — the classic shoe-shop holes */
  const run = $derived.by(() => {
    if (!p) return [];
    const sizes = [...new Set(siblings.map((x) => String(x.size || '').trim()).filter(Boolean))];
    if (!sizes.length && p.size) sizes.push(String(p.size).trim());
    sizes.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    return sizes.map((sz) => {
      const m = siblings.find((x) => String(x.size || '').trim() === sz);
      return { size: sz, qty: m?.qty ?? 0, here: m?.sku === p.sku };
    });
  });
  const holes = $derived(run.filter((r) => r.qty === 0));

  async function restockHoles() {
    invoicePreset.set({
      supplier: p.supplier || '',
      lines: [{
        name: p.name, category: p.category, type: p.type || '',
        typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '',
        color: p.color || '', cost: p.cost, price: p.price,
        sizes: Object.fromEntries(holes.map((h) => [h.size, 2])),
        photo: p.photo || null,
        modelId: p.modelId
      }]
    });
    onclose();
    ongoto('receive');
  }

  const profit = $derived((p?.price || 0) - (p?.cost || 0));

  async function bump(delta) {
    const q = await adjustQty(p.sku, delta);
    p = { ...p, qty: q };
    db.products.toArray().then((ps) => (siblings = ps.filter((x) => sameModel(x, p))));
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
        <img src={p.photo} alt={p.type || p.category} />
      {:else}
        <Icon name="image" size={40} color="var(--taupe)" />
      {/if}
    </div>
    <div class="info">
      <!-- الصورة هي الهوية — لا اسم -->
      <div class="id-line">
        <span class="id-type">{[p.type, p.typeSub, p.typeSub2, p.typeSub3, p.color].filter(Boolean).join(' - ') || p.category}</span>
        <VariantBits dense variants={[{ color: p.color, size: p.size }]} />
      </div>
      <div class="muted small">{[p.category, ...(Array.isArray(p.seasons) && p.seasons.length ? p.seasons : (p.season ? [p.season] : [])), p.material].filter(Boolean).join(' - ')}{p.typeSub ? ` - تفصيل: ${p.typeSub}` : ''}{p.typeSub2 ? ` - أدق: ${p.typeSub2}` : ''}{p.typeSub3 ? ` - أخير: ${p.typeSub3}` : ''}</div>
      <div class="sku">{p.sku}</div>
      {#if p.supplier}
        <div class="sup"><Icon name="upload" size={12} /> من {p.supplier}{p.supplierAt ? ` - ${fmtDate(p.supplierAt)}` : ''}</div>
      {/if}
    </div>
  </Glass>

  {#if run.length > 1}
    <Glass class="run" radius="var(--r-md)">
      <div class="run-head">
        <span class="bold small" style="display:inline-flex; align-items:center; gap:6px"><Icon name="list" size={14} color="var(--burgundy)" /> قوة المقاسات</span>
        <span class="muted tiny">{fmtNum(run.length)} مقاس</span>
      </div>
      <div class="run-row">
        {#each run as r (r.size)}
          <span class="run-chip" class:hole={r.qty === 0} class:here={r.here} title={r.qty ? `${r.size} — ${r.qty} قطعة` : `${r.size} — مفقود`}>
            {r.size}<b>{r.qty || '—'}</b>
          </span>
        {/each}
      </div>
      {#if holes.length}
        <div class="run-note">
          <Icon name="alert" size={13} /> مفقود: {holes.map((h) => h.size).join('، ')} — أكثر المقاسات طلباً عادةً
        </div>
        <button class="btn gold block" style="min-height:44px; font-size:13.5px" onclick={() => { buzz(10); restockHoles(); }}>
          <Icon name="upload" size={15} /> استلام الناقص — فاتورة وارد
        </button>
      {/if}
    </Glass>
  {/if}

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
              <div class="muted" style="font-size:11px">{m.note} - {fmtDate(m.date)}</div>
            </div>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}
</div>

<Sheet open={reserving} title="حجز قطعة" onclose={() => (reserving = false)}>
  <div class="stack" style="gap:12px">
    <div class="muted small">تُحجز قطعة واحدة لمدة {RESERVATION_HOURS} ساعة وتُخصم من المخزون الآن.</div>
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
  .info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .id-line { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
  .id-type { font-weight: 800; font-size: 16px; color: var(--ink); }
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

  .sup {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 4px;
    font-size: 11px; font-weight: 800;
    color: #8a6a35;
    background: var(--gold-soft, rgba(201, 162, 75, 0.12));
    border-radius: 999px;
    padding: 3px 9px;
    width: fit-content;
  }
  :global(.run) { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
  .run-head { display: flex; align-items: center; justify-content: space-between; }
  .run-row { display: flex; flex-wrap: wrap; gap: 6px; }
  .run-chip {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 800; color: var(--ink);
    background: rgba(78, 138, 95, 0.12);
    border: 1px solid rgba(78, 138, 95, 0.3);
    border-radius: 10px; padding: 5px 9px;
    font-variant-numeric: tabular-nums;
  }
  .run-chip b { color: var(--good); font-weight: 800; }
  .run-chip.here { box-shadow: 0 0 0 2px rgba(181, 73, 91, 0.35); border-color: var(--burgundy); }
  .run-chip.hole {
    background: rgba(122, 46, 58, 0.06);
    border: 1.5px dashed rgba(122, 46, 58, 0.45);
    color: var(--burgundy-deep);
  }
  .run-chip.hole b { color: var(--burgundy); }
  .run-note {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 700; color: var(--burgundy-deep);
  }
</style>
