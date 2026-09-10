<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, recordSale, piecesSoldToday } from '../db.js';
  import { fmtIQD, fmtNum, parseOrderText, buzz } from '../utils.js';
  import { toastOk, toastErr, toast, celebrateAt, milestoneFor } from '../store.js';

  /* العراق 18 محافظة */
  const PROVINCES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'القادسية', 'ذي قار', 'ميسان', 'مثنى', 'واسط', 'ديالى', 'صلاح الدين'];

  let text = $state('');
  let products = $state([]);
  let cart = $state([]); // { sku, name, price, cost, qty, max }
  let customerName = $state('');
  let customerPhone = $state('');
  let customerProvince = $state('');
  let customerAddress = $state('');
  let saving = $state(false);
  let tried = $state(false);

  /* الاسم والهاتف والمحافظة مطلوبة */
  const clientValid = $derived(customerName.trim().length > 0 && customerPhone.trim().length >= 7 && customerProvince !== '');

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

  const parsed = $derived(parseOrderText(text));

  /* score every in-stock product against the parsed text */
  const matches = $derived.by(() => {
    if (!text.trim()) return [];
    const kw = parsed.keywords.map((k) => k.toLowerCase());
    return products
      .filter((p) => p.qty > 0 && !cart.some((c) => c.sku === p.sku))
      .map((p) => {
        let score = 0;
        const hay = [p.name, p.color, p.type, p.category, p.brand].filter(Boolean).join(' ').toLowerCase();
        for (const k of kw) if (hay.includes(k)) score += 3;
        if (parsed.sizes.includes(String(p.size).trim())) score += 5;
        return { p, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  });

  const subtotal = $derived(cart.reduce((a, c) => a + c.price * c.qty, 0));

  function addToCart(m) {
    const p = m.p;
    cart = [...cart, { sku: p.sku, name: p.name, price: p.price, cost: p.cost, qty: 1, max: p.qty, color: p.color || '', size: String(p.size || '').trim() }];
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

  async function finish() {
    if (saving || !cart.length) return;
    saving = true;
    try {
      const sale = await recordSale({
        items: cart.map((c) => ({ sku: c.sku, name: c.name, price: c.price, cost: c.cost, qty: c.qty, color: c.color || '', size: c.size || '' })),
        customerName,
        customerPhone,
        province: customerProvince,
        address: customerAddress,
        deliveryFee: 0,
        status: 'delivered', // in-store sale — no delivery pending
        deliveryCompany: ''
      });
      cart = [];
      text = '';
      customerName = '';
      customerPhone = '';
      customerProvince = '';
      customerAddress = '';
      tried = false;
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🛍️');
      toastOk(`تم البيع #${sale.id} — ${fmtIQD(sale.total)}`);
      const sold = await piecesSoldToday();
      const ms = milestoneFor(sold);
      if (ms) {
        setTimeout(() => {
          celebrateAt(window.innerWidth / 2, window.innerHeight / 2.4, '🏆');
          buzz([40, 80, 40, 80, 40]);
          toastOk(ms.text, 'success', 4200);
        }, 700);
      }
    } catch (e) {
      console.error(e);
      toastErr('تعذر إتمام البيع');
    } finally {
      saving = false;
    }
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="rise" style="animation-delay:0.03s; padding:14px 16px">
    <div class="f-head">
      <span class="f-title"><Icon name="chat" size={16} color="var(--burgundy)" /> الصق رسالة الزبونة</span>
    </div>
    <textarea
      class="input paste-box"
      bind:value={text}
      rows="4"
      placeholder="مثال: اريد بوت جلد اسود مقاس 38…"
    ></textarea>
    {#if parsed.sizes.length}
      <div class="row wrap" style="gap:6px; margin-top:8px">
        {#each parsed.sizes as s (s)}<span class="chip on">مقاس {s}</span>{/each}
      </div>
    {/if}
  </Glass>

  {#if text.trim() && matches.length === 0 && cart.length === 0}
    <Glass class="rise" style="padding:18px; text-align:center">
      <div class="muted small">ما لقينا موديل مطابق — جرّبي كلمات أخرى أو أضيفي البيع يدوياً من تبويب بيع</div>
    </Glass>
  {/if}

  {#if matches.length}
    <div class="stack" style="gap:8px">
      {#each matches as m (m.p.sku)}
        <Glass
          as="button"
          class="pcard rise"
          onclick={() => addToCart(m)}
        >
          <div class="pinfo">
            <div class="pname">{m.p.name}</div>
            <VariantBits dense variants={[{ color: m.p.color, size: m.p.size }]} />
          </div>
          <span class="pprice">{fmtIQD(m.p.price)}</span>
          <span class="add-ic"><Icon name="plus" size={15} color="#fff" /></span>
        </Glass>
      {/each}
    </div>
  {/if}

  {#if cart.length}
    <Glass class="cart rise" style="animation-delay:0.05s">
      <div class="stack" style="gap:8px">
        {#each cart as c (c.sku)}
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="bold small">{c.name}</div>
              <VariantBits dense variants={[{ color: c.color, size: c.size }]} />
              <div class="muted tiny">{fmtIQD(c.price)} × {c.qty}</div>
            </div>
            <div class="stepper">
              <button class="stp" onclick={() => setQty(c.sku, -1)}>−</button>
              <span class="qn">{c.qty}</span>
              <button class="stp" onclick={() => setQty(c.sku, +1)}>+</button>
            </div>
          </div>
        {/each}
        <hr class="divider-gold" style="margin:2px 0" />
        <div class="row" style="gap:8px">
          <div class="field" style="flex:1">
            <label>الاسم <span class="req">*</span></label>
            <input class="input" bind:value={customerName} class:invalid={tried && !customerName.trim()} placeholder="اسم الزبونة" />
            {#if tried && !customerName.trim()}<span class="err">مطلوب</span>{/if}
          </div>
          <div class="field" style="flex:1">
            <label>الهاتف <span class="req">*</span></label>
            <input class="input" bind:value={customerPhone} class:invalid={tried && customerPhone.trim().length < 7} placeholder="07xx…" inputmode="tel" />
            {#if tried && customerPhone.trim().length < 7}<span class="err">رقم صحيح مطلوب</span>{/if}
          </div>
        </div>
        <div class="row" style="gap:8px">
          <div class="field" style="flex:1">
            <label>المحافظة <span class="req">*</span></label>
            <select class="input" bind:value={customerProvince} class:invalid={tried && !customerProvince} style="height:50px">
              <option value="" disabled>اختاري…</option>
              {#each PROVINCES as pv (pv)}<option value={pv}>{pv}</option>{/each}
            </select>
            {#if tried && !customerProvince}<span class="err">مطلوبة</span>{/if}
          </div>
          <div class="field" style="flex:1">
            <label>العنوان <span class="muted tiny">(اذا متوفر)</span></label>
            <input class="input" bind:value={customerAddress} placeholder="أقرب نقطة دالة…" />
          </div>
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="bold">الإجمالي</span>
          <span class="money" style="color:var(--burgundy); font-size:17px">{fmtIQD(subtotal)}</span>
        </div>
        <button class="btn primary lg block" onclick={() => { if (!clientValid) { tried = true; buzz([30, 40, 30]); return; } finish(); }} disabled={saving}>
          <Icon name="check" size={20} /> تأكيد البيع
        </button>
      </div>
    </Glass>
  {/if}
</div>

<style>
  .paste-box {
    width: 100%;
    min-height: 90px;
    resize: vertical;
    margin-top: 10px;
    line-height: 1.7;
  }
  :global(.pcard) {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; cursor: pointer; text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.pcard:active) { transform: scale(0.98); }
  .pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .pname { font-weight: 800; font-size: 14px; color: var(--ink); }
  .pprice { font-weight: 800; font-size: 13px; color: var(--burgundy); white-space: nowrap; }
  .add-ic {
    flex: none; width: 30px; height: 30px; border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
  }
  :global(.cart) { padding: 14px 16px; }
  .stepper { display: flex; align-items: center; gap: 8px; }
  .stp {
    width: 32px; height: 32px; border-radius: 10px;
    border: 1px solid var(--line-2); background: rgba(255, 255, 255, 0.6);
    font-size: 18px; font-weight: 800; color: var(--burgundy); cursor: pointer;
  }
  .qn { min-width: 20px; text-align: center; font-weight: 800; }

  .req { color: var(--burgundy); font-weight: 800; }
  .err { display: block; font-size: 11px; color: var(--burgundy); font-weight: 700; margin-top: 3px; }
  :global(.invalid) { border-color: rgba(181, 73, 91, 0.55) !important; background: rgba(181, 73, 91, 0.05); }
</style>
