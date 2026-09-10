<script>
  /* العراق 18 محافظة — the delivery map of every sale */
  const PROVINCES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'القادسية', 'ذي قار', 'ميسان', 'مثنى', 'واسط', 'ديالى', 'صلاح الدين'];

  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Scanner from '../components/Scanner.svelte';
  import Dropdown from '../components/Dropdown.svelte';
  import SpeedDial from '../components/SpeedDial.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, recordSale, getSetting, piecesSoldToday, modelOptions } from '../db.js';
  import { fmtIQD, fmtNum, buzz, iqd } from '../utils.js';
  import { get } from 'svelte/store';
  import { toastOk, toastErr, toast, celebrateAt, milestoneFor, sellPrefill, catalogFilters } from '../store.js';

  let { goto } = $props();

  let products = $state([]);
  let opts = $state({ types: [], seasons: [], colors: [] });

  /* shared filters — the exact same فلاتر state as المخزون, in both directions */
  let f = $state(JSON.parse(JSON.stringify(get(catalogFilters))));
  $effect(() => { catalogFilters.set(f); });

  /* «اعرضيها بخصم» and friends can prefill the search from the dashboard */
  const prefill = get(sellPrefill);
  if (prefill) { f.q = prefill; sellPrefill.set(null); }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, o] = await Promise.all([db.products.toArray(), modelOptions()]);
      if (alive) { products = p; opts = o; }
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const cats = $derived.by(() => {
    const set = [...new Set(products.map((p) => p.category))];
    return [
      { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.qty > 0).length, clear: true },
      ...set.map((c) => ({ value: c, label: c, icon: 'tag', count: products.filter((p) => p.category === c && p.qty > 0).length }))
    ];
  });
  const types = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.type).length, clear: true },
    ...opts.types.map((t) => ({ value: t, label: t, icon: 'list', count: products.filter((p) => p.type === t).length }))
  ]);
  const seasons = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.season).length, clear: true },
    ...opts.seasons.map((s) => ({ value: s, label: s, icon: 'calendar', count: products.filter((p) => p.season === s).length }))
  ]);

  /* same three states as المخزون — one shared vocabulary (no منخفضة) */
  const AVAIL = [
    { value: 'in', label: 'متوفر', icon: 'check', clear: true },
    { value: 'all', label: 'الكل (حتى النافد)', icon: 'dots' },
    { value: 'out', label: 'نفد', icon: 'x' }
  ];

  const SORTS = [
    { value: 'new', label: 'الأحدث', icon: 'sparkle', clear: true },
    { value: 'price', label: 'الأعلى سعراً', icon: 'tag' },
    { value: 'qty', label: 'الأقل كمية', icon: 'chart' }
  ];

  const filtered = $derived.by(() => {
    let list = products;
    if (f.availSell === 'in') list = list.filter((p) => p.qty > 0);
    else if (f.availSell === 'out') list = list.filter((p) => p.qty === 0);
    if (f.cat !== 'الكل') list = list.filter((p) => p.category === f.cat);
    if (f.typ !== 'الكل') list = list.filter((p) => p.type === f.typ);
    if (f.season !== 'الكل') list = list.filter((p) => p.season === f.season);
    if (f.q.trim()) {
      const s = f.q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.color, p.sku, p.size, p.barcode, p.type, p.season, p.material].filter(Boolean).join(' ').toLowerCase().includes(s)
      );
    }
    const sorted = [...list];
    if (f.sort === 'new') sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (f.sort === 'price') sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (f.sort === 'qty') sorted.sort((a, b) => a.qty - b.qty);
    return sorted;
  });

  /* ---- Premium filter bar state ---- */
  const activeCount = $derived((f.cat !== 'الكل' ? 1 : 0) + (f.typ !== 'الكل' ? 1 : 0) + (f.season !== 'الكل' ? 1 : 0) + (f.availSell !== 'in' ? 1 : 0) + (f.sort !== 'new' ? 1 : 0) + (f.q.trim() ? 1 : 0));
  const isDefault = $derived(f.cat === 'الكل' && f.typ === 'الكل' && f.season === 'الكل' && f.availSell === 'in' && f.sort === 'new' && !f.q.trim());

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
    if (f.availSell !== 'in') tags.push({ key: 'avail', label: AVAIL.find((a) => a.value === f.availSell)?.label || '' });
    if (f.sort !== 'new') tags.push({ key: 'sort', label: `ترتيب: ${SORTS.find((s) => s.value === f.sort)?.label || ''}` });
    return tags;
  });

  function removeTag(key) {
    if (key === 'q') f.q = '';
    if (key === 'cat') f.cat = 'الكل';
    if (key === 'typ') f.typ = 'الكل';
    if (key === 'season') f.season = 'الكل';
    if (key === 'avail') f.availSell = 'in';
    if (key === 'sort') f.sort = 'new';
    buzz(6);
  }

  /* ---- Cart (survives tab switches and reloads) ---- */
  const CART_KEY = 'ghazala.sell.cart';
  const LAST_KEY = 'ghazala.sell.lastCart';
  const LAST_TTL = 30 * 60 * 1000;

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(raw) ? raw.filter((c) => c && c.sku && c.qty > 0) : [];
    } catch { return []; }
  }
  function loadLast() {
    try {
      const l = JSON.parse(localStorage.getItem(LAST_KEY));
      if (!l || !Array.isArray(l.items) || !l.items.length) return null;
      if (Date.now() - (l.at || 0) > LAST_TTL) { localStorage.removeItem(LAST_KEY); return null; }
      return l;
    } catch { return null; }
  }

  let cart = $state(loadCart()); // { sku, name, price, cost, qty, max }
  let lastCart = $state(loadLast()); // { items, at } — emptied cart, one-tap reopen
  const cartCount = $derived(cart.reduce((a, c) => a + c.qty, 0));
  const subtotal = $derived(cart.reduce((a, c) => a + c.price * c.qty, 0));
  const lastCount = $derived(lastCart ? lastCart.items.reduce((a, c) => a + c.qty, 0) : 0);
  const lastSum = $derived(lastCart ? lastCart.items.reduce((a, c) => a + c.price * c.qty, 0) : 0);

  $effect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  });

  /* when stock moves under an open cart (another sale, stocktake, expiry) — clamp or drop */
  $effect(() => {
    if (!products.length || !cart.length) return;
    let changed = false;
    const gone = [];
    const next = [];
    for (const c of cart) {
      const p = products.find((x) => x.sku === c.sku);
      if (!p || p.qty === 0) { changed = true; gone.push(c.name); continue; }
      if (c.qty > p.qty || c.max !== p.qty || (!c.color && p.color) || (!c.size && p.size)) {
        changed = true;
        next.push({ ...c, qty: Math.min(c.qty, p.qty), max: p.qty, color: c.color || p.color || '', size: c.size || String(p.size || '').trim() });
      }
      else next.push(c);
    }
    if (changed) {
      cart = next;
      if (gone.length) toastErr(gone.length === 1 ? `«${gone[0]}» نفد — أُزيل من السلة` : 'بعض موديلات السلة نفدت وأُزيلت');
    }
  });

  function archiveLast() {
    if (!cart.length) return;
    lastCart = { items: cart.map((c) => ({ ...c })), at: Date.now() };
    try { localStorage.setItem(LAST_KEY, JSON.stringify(lastCart)); } catch {}
  }
  function dismissLast() {
    lastCart = null;
    try { localStorage.removeItem(LAST_KEY); } catch {}
    buzz(6);
  }
  function restoreLast() {
    if (!lastCart) return;
    cart = lastCart.items.map((c) => ({ ...c }));
    lastCart = null;
    try { localStorage.removeItem(LAST_KEY); } catch {}
    buzz(10);
    toastOk('أُعيدت آخر سلة — تفضل');
  }

  function addToCart(p) {
    if (p.qty <= 0) { toastErr('هذا الموديل نفد من المخزون'); return; }
    const found = cart.find((c) => c.sku === p.sku);
    if (found) {
      if (found.qty >= p.qty) { toastErr('وصلت لأقصى الكمية المتوفرة'); return; }
      found.qty++;
      cart = cart;
    } else {
      cart = [...cart, { sku: p.sku, name: p.name, price: p.price, cost: p.cost, qty: 1, max: p.qty, color: p.color || '', size: String(p.size || '').trim() }];
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
  let cprovince = $state('');
  let caddress = $state('');
  let fee = $state(5000);
  let barcode = $state('');
  let company = $state('');
  let companies = $state([]);
  let scanOpen = $state(false);
  let itemScanOpen = $state(false);
  let saving = $state(false);
  let tried = $state(false);

  /* cart bar portal — pinned to the viewport, immune to the screen transform */
  let barHost = $state(null);
  $effect(() => {
    if (!barHost) return;
    document.body.appendChild(barHost);
    /* same leak-proofing as the FAB portal: without this the bar haunts other tabs */
    return () => barHost.remove();
  });

  /* the three required client fields: الاسم، الهاتف، المحافظة */
  const clientValid = $derived(cname.trim().length > 0 && cphone.trim().length >= 7 && cprovince !== '');

  async function openCheckout() {
    if (!cart.length) return;
    fee = await getSetting('deliveryFee', 5000);
    companies = await getSetting('deliveryCompanies', []);
    checkout = true;
    buzz(10);
  }

  async function finishSale() {
    if (saving) return;
    saving = true;
    try {
      const sale = await recordSale({
        items: cart.map((c) => ({ sku: c.sku, name: c.name, price: c.price, cost: c.cost, qty: c.qty, color: c.color || '', size: c.size || '' })),
        customerName: cname,
        customerPhone: cphone,
        province: cprovince,
        address: caddress,
        deliveryFee: iqd(fee),
        barcode,
        deliveryCompany: company,
        status: 'pending'
      });
      checkout = false;
      cart = [];
      cname = ''; cphone = ''; cprovince = ''; caddress = ''; barcode = ''; company = ''; tried = false;
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🛍️');
      toastOk(`تم البيع #${sale.id} — ${fmtIQD(sale.total)}`);
      /* milestone: today's piece count crossed a threshold (خمس قطع وأعلى) */
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
  /* ---- Floating action menu ---- */
  const dialActions = [
    { id: 'scan', label: 'مسح باركود موديل', icon: 'scan' },
    { id: 'paste', label: 'بيع من رسالة واتساب', icon: 'chat' }
  ];
  function onDial(a) {
    if (a.id === 'scan') { f.q = ''; itemScanOpen = true; }
    if (a.id === 'paste') goto('pastesell');
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="search" radius="var(--r-md)">
    <Icon name="search" size={18} color="var(--taupe)" />
    <input placeholder="ابحث عن موديل…" bind:value={f.q} />
    {#if f.q}<button class="clr" onclick={() => (f.q = '')}><Icon name="x" size={14} /></button>{/if}
  </Glass>

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
      <Dropdown bind:value={f.cat} options={cats} icon="tag" placeholder="التصنيف: الكل" />
      <Dropdown bind:value={f.typ} options={types} icon="list" placeholder="النوع: الكل" />
      <Dropdown bind:value={f.season} options={seasons} icon="calendar" placeholder="الموسم: الكل" />
    </div>
    <div class="f-row">
      <Dropdown bind:value={f.availSell} options={AVAIL} icon="box" placeholder="الحالة: متوفر" />
      <Dropdown bind:value={f.sort} options={SORTS} icon="sparkle" placeholder="ترتيب: الأحدث" />
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
    {fmtNum(filtered.length)} موديل{f.cat !== 'الكل' ? ` في ${f.cat}` : ''}{f.availSell === 'out' ? ' (نفد)' : ''}
  </div>

  {#if filtered.length === 0}
    <EmptyState
      title={isDefault ? (products.length ? 'لا شيء متوفر حالياً' : 'لا موديلات للبيع') : 'لا نتائج مطابقة'}
      subtitle={isDefault ? (products.length ? 'كل الموديلات نفدت — استكمل الكميات من المخزون أولاً' : 'أضف موديلات أولاً من تبويب المخزون') : 'الموديلات موجودة لكن الفلاتر الحالية تخفيها'}
      actionLabel={isDefault ? 'إلى المخزون' : 'عرض الكل'}
      onaction={isDefault ? () => goto('inventory') : clearAllFilters}
      icon={isDefault ? 'box' : 'search'}
    />
  {:else}
    <div class="grid">
      {#each filtered as p, i (p.sku)}
        <Glass
          as="button"
          class="pcard rise {p.qty === 0 ? 'oos' : ''}"
          style="animation-delay:{Math.min(i * 0.04, 0.4)}s"
          onclick={() => addToCart(p)}
        >
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
        </Glass>
      {/each}
    </div>
  {/if}
</div>

<!-- Floating cart bar — portaled to <body> so the screen slide-in never drags it -->
<div class="bar-portal" bind:this={barHost}>
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
      <button class="cart-x" onclick={() => { archiveLast(); cart = []; buzz(10); }} aria-label="إفراغ السلة">
        <Icon name="trash" size={17} />
      </button>
    </div>
  {:else if lastCart}
    <!-- Last-cart quick reopen -->
    <div class="cartbar glass-strong">
      <button class="cart-info" onclick={restoreLast}>
        <span class="cart-badge pop undo"><Icon name="undo" size={18} color="#fff" /></span>
        <div class="cart-txt">
          <div class="bold">استرجاع آخر سلة</div>
          <div class="muted small">{fmtNum(lastCount)} عناصر • {fmtIQD(lastSum)}</div>
        </div>
      </button>
      <button class="cart-x" onclick={dismissLast} aria-label="تجاهل">
        <Icon name="x" size={17} />
      </button>
    </div>
  {/if}
</div>

<SpeedDial actions={dialActions} onselect={onDial} label="إجراءات البيع" lift={cart.length > 0 || !!lastCart} />

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
      <Glass class="citem" radius="var(--r-md)">
        <div class="ci-info">
          <div class="bold">{c.name}</div>
          {#if c.color || c.size}<div class="ci-variant">{c.color ? `● ${c.color}` : ''}{c.color && c.size ? ' • ' : ''}{c.size ? `مقاس ${c.size}` : ''}</div>{/if}
          <div class="muted small">{fmtIQD(c.price)} × {c.qty} = <span class="money">{fmtIQD(c.price * c.qty)}</span></div>
        </div>
        <div class="stepper">
          <button class="stp" onclick={() => setQty(c.sku, -1)}>−</button>
          <span class="qn">{c.qty}</span>
          <button class="stp" onclick={() => setQty(c.sku, +1)}>+</button>
        </div>
      </Glass>
    {/each}

    <hr class="divider-gold" />

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>اسم الزبون <span class="req">*</span></label>
        <input class="input" bind:value={cname} class:invalid={tried && !cname.trim()} placeholder="الاسم الكامل" />
        {#if tried && !cname.trim()}<span class="err">الاسم مطلوب</span>{/if}
      </div>
      <div class="field" style="flex:1">
        <label>هاتف الزبون <span class="req">*</span></label>
        <input class="input" bind:value={cphone} inputmode="tel" class:invalid={tried && cphone.trim().length < 7} placeholder="07xx…" />
        {#if tried && cphone.trim().length < 7}<span class="err">رقم صحيح مطلوب</span>{/if}
      </div>
    </div>

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>المحافظة <span class="req">*</span></label>
        <select class="input" bind:value={cprovince} class:invalid={tried && !cprovince} style="height:50px">
          <option value="" disabled>اختر المحافظة…</option>
          {#each PROVINCES as pv (pv)}<option value={pv}>{pv}</option>{/each}
        </select>
        {#if tried && !cprovince}<span class="err">المحافظة مطلوبة</span>{/if}
      </div>
    </div>
    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>العنوان الكامل <span class="muted tiny">(اذا متوفر)</span></label>
        <input class="input" bind:value={caddress} placeholder="أقرب نقطة دالة…" />
      </div>
    </div>

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>أجور التوصيل (د.ع) <span class="muted tiny">— 5 = 5,000</span></label>
        <input class="input" bind:value={fee} inputmode="decimal" />
      </div>
      <div class="field" style="flex:1">
        <label>شركة التوصيل</label>
        {#if companies.length}
          <select class="input" bind:value={company} style="height:50px">
            <option value="">بدون</option>
            {#each companies as co (co)}<option value={co}>{co}</option>{/each}
          </select>
        {:else}
          <input class="input" bind:value={company} placeholder="اسم الشركة (اختياري)" />
        {/if}
      </div>
    </div>
    <div class="row" style="gap:10px">
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

    <Glass class="totals" radius="var(--r-md)">
      <div class="row" style="justify-content:space-between"><span class="muted">المجموع</span><span class="money">{fmtIQD(subtotal)}</span></div>
      <div class="row" style="justify-content:space-between"><span class="muted">التوصيل</span><span class="money">{fmtIQD(iqd(fee))}</span></div>
      <hr class="divider-gold" style="margin:4px 0" />
      <div class="row" style="justify-content:space-between">
        <span class="bold">الإجمالي</span>
        <span class="bold" style="font-size:18px; color:var(--burgundy)">{fmtIQD(subtotal + iqd(fee))}</span>
      </div>
    </Glass>

    <button class="btn primary lg block" onclick={() => { if (!clientValid) { tried = true; buzz([30, 40, 30]); return; } finishSale(); }} disabled={saving || !cart.length}>
      <Icon name="check" size={20} /> تأكيد البيع
    </button>
  </div>
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

  .grid { display: flex; flex-direction: column; gap: 10px; padding-bottom: 150px; }
  :global(.pcard) {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    cursor: pointer;
    text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.pcard:active) { transform: scale(0.98); }
  :global(.pcard.oos) { opacity: 0.55; }
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

  .bar-portal { display: contents; }
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
  .cart-badge.undo {
    background: linear-gradient(150deg, var(--gold), #a4803e);
    box-shadow: 0 6px 16px rgba(164, 128, 62, 0.35);
    display: flex; align-items: center; justify-content: center;
  }
  .cart-x {
    width: 40px; height: 40px;
    border-radius: 12px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.5);
    color: var(--burgundy);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }

  :global(.citem) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--r-md);
  }
  .stepper { display: flex; align-items: center; gap: 8px; flex: none; }
  .ci-variant { font-size: 11.5px; font-weight: 800; color: var(--burgundy-deep); }
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

  :global(.totals) { padding: 12px 16px; border-radius: var(--r-md); display: flex; flex-direction: column; gap: 6px; }

  .req { color: var(--burgundy); font-weight: 800; }
  .err { display: block; font-size: 11px; color: var(--burgundy); font-weight: 700; margin-top: 3px; }
  :global(.invalid) { border-color: rgba(181, 73, 91, 0.55) !important; background: rgba(181, 73, 91, 0.05); }
</style>
