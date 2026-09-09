<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Scanner from '../components/Scanner.svelte';
  import { db, recordSale, getSetting } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, toast, celebrateAt } from '../store.js';

  let products = $state([]);
  let q = $state('');

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

  const results = $derived.by(() => {
    if (!q.trim()) return products.filter((p) => p.qty > 0).slice(0, 12);
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => [p.name, p.color, p.sku, p.size, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(s))
      .slice(0, 20);
  });

  /* ---- Cart ---- */
  let cart = $state([]); // { sku, name, price, cost, qty, max }
  const cartCount = $derived(cart.reduce((a, c) => a + c.qty, 0));
  const subtotal = $derived(cart.reduce((a, c) => a + c.price * c.qty, 0));

  function addToCart(p) {
    if (p.qty <= 0) { toastErr('هذا الموديل نفد من المخزون'); return; }
    const found = cart.find((c) => c.sku === p.sku);
    if (found) {
      if (found.qty >= p.qty) { toastErr('وصلت لأقصى الكمية المتوفرة'); return; }
      found.qty++;
      cart = cart;
    } else {
      cart = [...cart, { sku: p.sku, name: p.name, price: p.price, cost: p.cost, qty: 1, max: p.qty }];
    }
    buzz(8);
    toast(`${p.name} أُضيف للسلة`);
  }

  function setQty(sku, d) {
    const c = cart.find((x) => x.sku === sku);
    if (!c) return;
    if (d > 0 && c.qty >= c.max) { toastErr('أقصى كمية متوفرة'); return; }
    c.qty += d;
    if (c.qty <= 0) cart = cart.filter((x) => x.sku !== sku);
    else cart = cart;
    buzz(6);
  }

  /* ---- Checkout ---- */
  let checkout = $state(false);
  let cname = $state('');
  let cphone = $state('');
  let fee = $state(5000);
  let barcode = $state('');
  let scanOpen = $state(false);
  let itemScanOpen = $state(false);
  let saving = $state(false);

  async function openCheckout() {
    if (!cart.length) return;
    fee = await getSetting('deliveryFee', 5000);
    checkout = true;
    buzz(10);
  }

  async function finishSale() {
    if (saving) return;
    saving = true;
    try {
      const sale = await recordSale({
        items: cart.map((c) => ({ sku: c.sku, name: c.name, price: c.price, cost: c.cost, qty: c.qty })),
        customerName: cname,
        customerPhone: cphone,
        deliveryFee: Number(fee) || 0,
        barcode,
        status: 'pending'
      });
      checkout = false;
      cart = [];
      cname = ''; cphone = ''; barcode = ''; q = '';
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🛍️');
      toastOk(`تم البيع #${sale.id} — ${fmtIQD(sale.total)}`);
    } catch (e) {
      console.error(e);
      toastErr('تعذر إتمام البيع');
    } finally {
      saving = false;
    }
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="gap:10px">
    <div class="search glass">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث عن موديل…" bind:value={q} />
      {#if q}<button class="clr" onclick={() => (q = '')}><Icon name="x" size={14} /></button>{/if}
    </div>
    <button class="iconbtn" style="width:50px; height:50px; flex:none" aria-label="مسح باركود" onclick={() => { buzz(8); q = ''; itemScanOpen = true; }}>
      <Icon name="scan" size={20} />
    </button>
  </div>

  <div class="grid">
    {#each results as p (p.sku)}
      <button class="pcard glass rise" class:oos={p.qty === 0} onclick={() => addToCart(p)}>
        <div class="pthumb">
          {#if p.photo}<img src={p.photo} alt={p.name} />{:else}<Icon name="box" size={24} color="var(--taupe)" />{/if}
        </div>
        <div class="pinfo">
          <div class="pname">{p.name}</div>
          <div class="pmeta muted small">{p.color || p.category}{p.size ? ' • ' + p.size : ''}</div>
          <div class="prow">
            <span class="pprice">{fmtIQD(p.price)}</span>
            <span class="pqty" class:zero={p.qty === 0}>{p.qty === 0 ? 'نفد' : `× ${fmtNum(p.qty)}`}</span>
          </div>
        </div>
        <span class="add-ic"><Icon name="plus" size={16} color="#fff" /></span>
      </button>
    {/each}
  </div>

  {#if results.length === 0}
    <div class="glass empty">
      <div class="empty-ic floaty"><Icon name="search" size={30} color="var(--burgundy)" /></div>
      <p class="muted center">لا توجد نتائج{q ? ` لـ «${q}»` : ''}</p>
    </div>
  {/if}
</div>

<!-- Floating cart bar -->
{#if cart.length}
  <div class="cartbar glass-strong">
    <button class="cart-info" onclick={() => { buzz(8); checkout = true; }}>
      <span class="cart-badge pop">{cartCount}</span>
      <div class="cart-txt">
        <div class="bold">متابعة البيع</div>
        <div class="muted small">{fmtIQD(subtotal)}</div>
      </div>
      <Icon name="back" size={18} color="var(--burgundy)" />
    </button>
    <button class="cart-x" onclick={() => { cart = []; buzz(10); }} aria-label="إفراغ السلة">
      <Icon name="trash" size={17} />
    </button>
  </div>
{/if}

<!-- Item scanner (finds a product by its barcode/SKU) -->
<Scanner open={itemScanOpen} title="مسح باركود الموديل" onclose={() => (itemScanOpen = false)}
  onscan={(code) => {
    itemScanOpen = false;
    const p = products.find((x) => x.barcode === code || x.sku === code);
    if (p) addToCart(p);
    else toastErr('لا يوجد موديل بهذا الكود — أضف الباركود من تفاصيل الموديل');
  }}
/>

<!-- Shipment scanner (captures the delivery company's barcode) -->
<Scanner open={scanOpen} title="باركود شركة التوصيل" onclose={() => (scanOpen = false)}
  onscan={(code) => {
    scanOpen = false;
    barcode = code;
  }}
/>

<!-- Checkout sheet -->
<Sheet open={checkout} title="إتمام البيع" onclose={() => (checkout = false)}>
  <div class="stack" style="gap:14px">
    {#each cart as c (c.sku)}
      <div class="citem glass">
        <div class="ci-info">
          <div class="bold">{c.name}</div>
          <div class="muted small">{fmtIQD(c.price)} × {c.qty} = <span class="money">{fmtIQD(c.price * c.qty)}</span></div>
        </div>
        <div class="stepper">
          <button class="stp" onclick={() => setQty(c.sku, -1)}>−</button>
          <span class="qn">{c.qty}</span>
          <button class="stp" onclick={() => setQty(c.sku, +1)}>+</button>
        </div>
      </div>
    {/each}

    <hr class="divider-gold" />

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>اسم الزبون</label>
        <input class="input" bind:value={cname} placeholder="اختياري" />
      </div>
      <div class="field" style="flex:1">
        <label>هاتف الزبون</label>
        <input class="input" bind:value={cphone} inputmode="tel" placeholder="07xx…" />
      </div>
    </div>

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>أجور التوصيل (د.ع)</label>
        <input class="input" bind:value={fee} inputmode="numeric" />
      </div>
      <div class="field" style="flex:1">
        <label>باركود شركة التوصيل</label>
        <div class="row" style="gap:6px">
          <button class="btn" style="flex:1; min-width:0; justify-content:flex-start" onclick={() => { buzz(8); scanOpen = true; }}>
            <Icon name="scan" size={18} color="var(--burgundy)" />
            <span class="small" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">{barcode || 'مسح الباركود…'}</span>
          </button>
          {#if barcode}
            <button class="iconbtn" style="width:46px; height:46px; flex:none" aria-label="حذف الباركود" onclick={() => { barcode = ''; buzz(8); }}>
              <Icon name="x" size={17} />
            </button>
          {/if}
        </div>
      </div>
    </div>

    <div class="totals glass">
      <div class="row" style="justify-content:space-between"><span class="muted">المجموع</span><span class="money">{fmtIQD(subtotal)}</span></div>
      <div class="row" style="justify-content:space-between"><span class="muted">التوصيل</span><span class="money">{fmtIQD(Number(fee) || 0)}</span></div>
      <hr class="divider-gold" style="margin:4px 0" />
      <div class="row" style="justify-content:space-between">
        <span class="bold">الإجمالي</span>
        <span class="bold" style="font-size:18px; color:var(--burgundy)">{fmtIQD(subtotal + (Number(fee) || 0))}</span>
      </div>
    </div>

    <button class="btn primary lg block" onclick={finishSale} disabled={saving || !cart.length}>
      <Icon name="check" size={20} /> تأكيد البيع
    </button>
  </div>
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

  .grid { display: flex; flex-direction: column; gap: 10px; padding-bottom: 90px; }
  .pcard {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    cursor: pointer;
    text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .pcard:active { transform: scale(0.98); }
  .pcard.oos { opacity: 0.55; }
  .pthumb {
    width: 58px; height: 58px;
    border-radius: var(--r-sm);
    flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.65), rgba(181, 73, 91, 0.07));
    border: 1px solid var(--line);
    overflow: hidden;
  }
  .pthumb img { width: 100%; height: 100%; object-fit: cover; }
  .pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .pname { font-weight: 800; font-size: 14px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .prow { display: flex; justify-content: space-between; align-items: baseline; }
  .pprice { font-weight: 800; font-size: 13.5px; color: var(--burgundy); }
  .pqty { font-size: 12px; color: var(--taupe); font-weight: 700; }
  .pqty.zero { color: var(--burgundy-deep); }
  .add-ic {
    flex: none;
    width: 34px; height: 34px;
    border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(181, 73, 91, 0.35);
  }

  .cartbar {
    position: fixed;
    bottom: calc(var(--nav-h) + 22px + var(--sab));
    left: 12px;
    right: 12px;
    max-width: 536px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 20px;
    z-index: 45;
  }
  .cart-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: right;
    padding: 4px 6px;
  }
  .cart-badge {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800;
    font-size: 16px;
    box-shadow: 0 6px 16px rgba(181, 73, 91, 0.4);
  }
  .cart-txt { flex: 1; display: flex; flex-direction: column; align-items: flex-start; }
  .cart-x {
    width: 40px; height: 40px;
    border-radius: 12px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.5);
    color: var(--burgundy);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }

  .citem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-md);
  }
  .stepper { display: flex; align-items: center; gap: 8px; flex: none; }
  .stp {
    width: 34px; height: 34px;
    border-radius: 11px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.6);
    font-size: 19px;
    font-weight: 800;
    color: var(--burgundy);
    cursor: pointer;
    transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .stp:active { transform: scale(0.85); }
  .qn { min-width: 22px; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }

  .totals { padding: 12px 16px; border-radius: var(--r-md); display: flex; flex-direction: column; gap: 6px; }
  .empty { padding: 26px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty-ic {
    width: 64px; height: 64px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: var(--accent-soft);
  }
</style>
