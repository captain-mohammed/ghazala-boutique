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
  import { longpress, flyToCart, popBadge } from '../motion.js';
  import VariantBits from '../components/VariantBits.svelte';
  import Pick from '../components/Pick.svelte';
  import { db, recordSale, getSetting, piecesSoldToday, modelOptions, modelGroupKey, subsOfType, subsOfType2, subsOfType3, hexForColor, countUnderType } from '../db.js';
  import { fmtIQD, fmtNum, buzz, iqd } from '../utils.js';
  import { get } from 'svelte/store';
  import { toastOk, toastErr, toast, celebrateAt, milestoneFor, sellPrefill, catalogFilters, filtersOpen } from '../store.js';

  let { goto } = $props();

  let products = $state([]);
  let sales = $state([]);
  let opts = $state({ types: [], seasons: [], colors: [] });

  /* shared filters — the exact same فلاتر state as المخزون, in both directions */
  let f = $state(JSON.parse(JSON.stringify(get(catalogFilters))));
  $effect(() => { catalogFilters.set(f); });

  /* the filter CARD collapses by default — expanding it never touches the filter values */
  let fOpen = $state(get(filtersOpen));
  $effect(() => { filtersOpen.set(fOpen); });

  /* «اعرضيها بخصم» and friends can prefill the search from the dashboard */
  const prefill = get(sellPrefill);
  if (prefill) { f.q = prefill; sellPrefill.set(null); }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, o] = await Promise.all([db.products.toArray(), db.sales.toArray(), modelOptions()]);
      if (alive) { products = p; sales = s; opts = o; }
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
  /* نوع ذو شجرة — نفس صفوف المخزون بالضبط (المستويان الفرعيان بمسافة بادئة) */
  const TYPE_SEP = '\u200b', TYPE_SEP2 = '\u200b\u200b', TYPE_SEP3 = '\u200b\u200b\u200b';
  /* كل مستوى يُحسب داخل أبويه (نفس منطق المخزون) */
  const typeRows = $derived.by(() => {
    const rows = [];
    for (const t of opts.types) {
      rows.push({ value: t, label: t, icon: 'list', count: countUnderType(products, { type: t }, { inStockOnly: true }) });
      for (const st of subsOfType(opts.typeSubs, t)) {
        rows.push({ value: TYPE_SEP + st, label: '↳ ' + st, icon: 'list', count: countUnderType(products, { type: t, typeSub: st }, { inStockOnly: true }) });
        for (const st2 of subsOfType2(opts.typeSubs2, t, st)) {
          rows.push({ value: TYPE_SEP2 + st2, label: '↳ ' + st2, icon: 'list', count: countUnderType(products, { type: t, typeSub: st, typeSub2: st2 }, { inStockOnly: true }) });
          for (const st3 of subsOfType3(opts.typeSubs3, t, st, st2))
            rows.push({ value: TYPE_SEP3 + st3, label: '↳ ' + st3, icon: 'list', count: countUnderType(products, { type: t, typeSub: st, typeSub2: st2, typeSub3: st3 }, { inStockOnly: true }) });
        }
      }
    }
    return rows;
  });
  const matchType = (p, tv) => {
    if (String(tv).startsWith(TYPE_SEP3)) return p.typeSub3 === tv.slice(3) && !!p.typeSub2;
    if (String(tv).startsWith(TYPE_SEP2)) return p.typeSub2 === tv.slice(2) && !!p.typeSub;
    if (String(tv).startsWith(TYPE_SEP)) return p.typeSub === tv.slice(1) && !!p.type;
    return p.type === tv;
  };
  const types = $derived.by(() => [
    { value: 'الكل', label: 'الكل', icon: 'dots', count: products.filter((p) => p.type).length, clear: true },
    ...typeRows
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

  /* One card per MODEL: same internal number (كل ألوانه ومقاساته معاً) —
     القيمة المخزنة هي الأقل كمية، والمعروض هو العدد الفعلي للقطع على الرف.
     كل بطاقة تحمل سطر معلومات يجمع كل مقاسات الموديل المتوفرة (مثل الـpicker). */
  const filtered = $derived.by(() => {
    let list = products;
    if (f.availSell === 'in') list = list.filter((p) => p.qty > 0);
    else if (f.availSell === 'out') list = list.filter((p) => p.qty === 0);
    if (f.cat !== 'الكل') list = list.filter((p) => p.category === f.cat);
    if (f.typ !== 'الكل') list = list.filter((p) => matchType(p, f.typ));
    if (f.season !== 'الكل') list = list.filter((p) => p.season === f.season);
    if (f.q.trim()) {
      const s = f.q.trim().toLowerCase();
      list = list.filter((p) =>
        [p.name, p.brand, p.color, p.sku, p.size, p.barcode, p.type, p.season, p.material].filter(Boolean).join(' ').toLowerCase().includes(s)
      );
    }
    const map = new Map();
    for (const p of list) {
      const k = modelGroupKey(p);
      if (!map.has(k)) map.set(k, { rep: p, subs: new Set(), subs2: new Set(), subs3: new Set() });
      else {
        const cur = map.get(k);
        if (new Date(p.createdAt) > new Date(cur.rep.createdAt)) cur.rep = p; // أحدث بطاقة تمثل الموديل
      }
      const g = map.get(k);
      if (p.typeSub) g.subs.add(p.typeSub);
      if (p.typeSub2) g.subs2.add(p.typeSub2);
      if (p.typeSub3) g.subs3.add(p.typeSub3);
    }
    /* سلسلة النوع من كل شجرة الموديل: النوع الرئيسي + كل التفاصيل الموجودة فيه */
    for (const g of map.values()) {
      g.typeChain = [g.rep.type, ...g.subs, ...g.subs2, ...g.subs3].filter(Boolean).join(' - ');
    }
    const sorted = [...map.values()].map((g) => ({ ...g.rep, modelChain: g.typeChain }));
    if (f.sort === 'new') sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (f.sort === 'price') sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
    if (f.sort === 'qty') sorted.sort((a, b) => a.qty - b.qty);
    return sorted;
  });

  /* المقاسات المتوفرة للموديل كله — نفس مصدر الـpicker بالضبط */
  const modelSizes = $derived.by(() => {
    const m = new Map();
    for (const p of products) {
      const k = modelGroupKey(p);
      if (!m.has(k)) m.set(k, new Set());
      if (p.qty > 0 && p.size) m.get(k).add(String(p.size).trim());
    }
    return m;
  });
  const sizesLabel = (p) => {
    const set = modelSizes.get(modelGroupKey(p));
    return set && set.size ? [...set].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).join('، ') : '—';
  };
  /* عدد القطع الكلي للموديل على الرف */
  const modelQty = $derived.by(() => {
    const m = new Map();
    for (const p of products) m.set(modelGroupKey(p), (m.get(modelGroupKey(p)) || 0) + (p.qty || 0));
    return m;
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
      return Array.isArray(raw)
        ? raw
            .filter((c) => c && c.sku && c.qty > 0)
            .map((c) => ({ ...c, vsKey: `${c.sku}|${c.color || ''}|${c.size || ''}` }))
        : [];
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

  let cart = $state(loadCart()); // { sku, vsKey, name, price, cost, qty, max, color, size } — one line per variant
  let lastCart = $state(loadLast()); // { items, at } — emptied cart, one-tap reopen
  const cartCount = $derived(cart.reduce((a, c) => a + c.qty, 0));
  const subtotal = $derived(cart.reduce((a, c) => a + c.price * c.qty, 0));
  const lastCount = $derived(lastCart ? lastCart.items.reduce((a, c) => a + c.qty, 0) : 0);
  const lastSum = $derived(lastCart ? lastCart.items.reduce((a, c) => a + c.price * c.qty, 0) : 0);

  $effect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  });

  /* when stock moves under an open cart (another sale, stocktake, expiry) — clamp or drop per variant */
  $effect(() => {
    if (!products.length || !cart.length) return;
    let changed = false;
    const gone = [];
    const next = [];
    for (const c of cart) {
      const p = products.find((x) => x.sku === c.sku);
      const max = p?.qty || 0;
      if (!p || max === 0) { changed = true; gone.push(c.name); continue; }
      if (c.qty > max || c.max !== max || c.vsKey !== `${c.sku}|${c.color || ''}|${c.size || ''}`) {
        changed = true;
        next.push({ ...c, qty: Math.min(c.qty, max), max, vsKey: `${c.sku}|${c.color || ''}|${c.size || ''}` });
      }
      else next.push(c);
    }
    if (changed) {
      cart = next;
      if (gone.length) toastErr(gone.length === 1 ? `«${gone[0]}» نفد — أُزيل من السلة` : 'بعض موديلات السلة نفدت وأُزيلت');
    }
  });

  /* نبض السلة: سلة فيها فلوس تنتظر — بعد 20 دقيقة سكون تُناده مرة واحدة بلطف،
     ولا يتكرر الإلحاح حتى تُفرَّغ وتبدأ سلة جديدة. */
  let cartReminded = $state(false);
  $effect(() => {
    const fingerprint = cart.map((c) => `${c.sku}:${c.qty}`).join('|');
    if (!cart.length) { cartReminded = false; return; }
    if (cartReminded) return;
    const t = setTimeout(() => {
      cartReminded = true;
      buzz([15, 40, 15]);
      toast('سلتك ما زالت بانتظارك 🛍');
      const bar = document.querySelector('.cartbar');
      if (bar) {
        bar.classList.remove('nudge');
        void bar.offsetWidth;
        bar.classList.add('nudge');
        setTimeout(() => bar.classList.remove('nudge'), 900);
      }
    }, 20 * 60 * 1000);
    return () => clearTimeout(t);
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

  function addToCart(p, el) {
    if (p.qty <= 0) { toastErr('هذا الموديل نفد من المخزون'); return; }
    /* دُرّبة الغزالة: القطعة تغادر الرف — رقاقة صورتها تطير بقوس ذهبي إلى السلة.
       بعد إطار واحد حتى تكون شارة السلة موجودة (السلة تظهر مع أول إضافة). */
    const fly = () =>
      requestAnimationFrame(() => {
        const badge = document.querySelector('.cart-badge');
        if (!el || !flyToCart(el, p.photo)) popBadge(badge);
      });
    /* سرعة هي الجوهر: لمسة واحدة = +1 قطعة فوراً.
       موديل بعدة تفاصيل → تُضاف أول قطعة متوفرة (أول لون بمقاسه)، والتعديل من السلة أو بالضغط المطول. */
    const variants = variantsOf(p);
    if (variants.length > 1) {
      const v = variants[0];
      addLine({ sku: v.sku, name: p.name, price: p.price, cost: p.cost, category: p.category, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '', color: v.color === NOCOLOR ? '' : v.color, size: v.size === '—' ? '' : v.size });
      fly();
      toast(`${p.modelChain || p.type || p.name} — ${v.color === NOCOLOR ? '' : v.color + ' '}${v.size !== '—' ? 'مقاس ' + v.size : ''} × 1`);
      return;
    }
    addLine({ sku: p.sku, name: p.name, price: p.price, cost: p.cost, category: p.category, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '', color: p.color || '', size: String(p.size || '').trim() });
    fly();
  }

  /* ضغطة مطولة على بطاقة البيع → قاطع التفاصيل الكامل (ألوان × مقاسات) */
  function openPickerFor(p) {
    if (p.qty <= 0) { toastErr('هذا الموديل نفد من المخزون'); return; }
    if (variantsOf(p).length > 1) { openVariants(p); return; }
    addToCart(p);
  }

  /* ---- Variant picker: colors × sizes chosen at checkout, only what's available ---- */
  const NOCOLOR = 'بلا لون';
  function variantsOf(p) {
    /* same model = same internal number (fallback to name for legacy cards) */
    return products
      .filter((x) => modelGroupKey(x) === modelGroupKey(p))
      .map((x) => ({ sku: x.sku, color: (x.color || '').trim() || NOCOLOR, size: String(x.size || '').trim() || '—', qty: x.qty || 0 }))
      .filter((v) => v.qty > 0)
      .sort((a, b) => a.color.localeCompare(b.color, 'ar') || (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0));
  }
  let vOpen = $state(false);
  let vpick = $state(null); // { name, price, cost, variants: [...] }
  let pk = $state({});      // vsKey → qty

  function openVariants(p) {
    vpick = { name: p.name, price: p.price, cost: p.cost, category: p.category, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '', variants: variantsOf(p) };
    pk = {};
    vOpen = true;
    buzz(10);
  }
  const vsKey = (v) => `${v.sku}|${v.color}|${v.size}`;
  /* available = shelf stock minus what's already in the cart for that variant */
  function freeOf(v) {
    const [sku, color, size] = [v.sku, v.color === NOCOLOR ? '' : v.color, v.size === '—' ? '' : v.size];
    const inCart = cart
      .filter((c) => c.sku === sku && (c.color || '') === color && (c.size || '') === size)
      .reduce((a, c) => a + c.qty, 0);
    return Math.max(0, v.qty - inCart);
  }
  function bump(v, d) {
    const k = vsKey(v);
    const free = freeOf(v);
    const cur = pk[k] || 0;
    if (d > 0 && cur >= free) { toastErr(free === 0 ? 'هذا المقاس انتهى' : 'أقصى الكمية المتوفرة'); return; }
    const next = cur + d;
    if (next <= 0) { const m = { ...pk }; delete m[k]; pk = m; }
    else pk = { ...pk, [k]: next };
    buzz(6);
  }
  function confirmVariants() {
    const chosen = vpick.variants.filter((v) => pk[vsKey(v)] > 0);
    if (!chosen.length) { toastErr('اختاري لوناً أو مقاساً أولاً'); return; }
    for (const v of chosen) {
      addLine({ sku: v.sku, name: vpick.name, price: vpick.price, cost: vpick.cost, category: vpick.category, type: vpick.type, typeSub: vpick.typeSub, typeSub2: vpick.typeSub2, typeSub3: vpick.typeSub3, color: v.color === NOCOLOR ? '' : v.color, size: v.size === '—' ? '' : v.size }, pk[vsKey(v)]);
    }
    vOpen = false;
    vpick = null;
    pk = {};
    buzz([12, 30, 12]);
  }

  /* one cart line per (sku, color, size) — same-kind pieces merge automatically */
  function addLine(v, qty = 1) {
    /* خُطوة: نبض اللمس يقوى مع امتلاء السلة — يدك تحس باليوم وهو يكبر (6ms → 10ms) */
    const step = 6 + Math.min(4, cartCount);
    const found = cart.find((c) => c.sku === v.sku && (c.color || '') === (v.color || '') && (c.size || '') === (v.size || ''));
    const max = products.find((x) => x.sku === v.sku)?.qty || 0;
    if (found) {
      if (found.qty + qty > max) { toastErr('وصلت لأقصى الكمية المتوفرة'); return; }
      found.qty += qty;
      cart = cart;
    } else {
      cart = [...cart, { ...v, qty, max, vsKey: `${v.sku}|${v.color || ''}|${v.size || ''}` }];
    }
    buzz(step);
    toast(`${v.name} أُضيف للسلة`);
  }

  function setQty(c, d) {
    if (d > 0 && c.qty >= c.max) { toastErr('أقصى كمية متوفرة'); return; }
    c.qty += d;
    if (c.qty <= 0) cart = cart.filter((x) => x !== c);
    else cart = cart;
    buzz(6);
  }

  /* ---- swap color/size of a cart line — only variants that actually exist in stock ---- */
  const modelMates = (c) =>
    products.filter((x) => (x.name || '').trim().toLowerCase() === (c.name || '').trim().toLowerCase() && (!c.category || x.category === c.category));
  function colorOptsFor(c) {
    const set = new Set(modelMates(c).filter((x) => x.qty > 0).map((x) => (x.color || '').trim() || NOCOLOR));
    set.add((c.color || '').trim() || NOCOLOR); // keep the line's own choice listed
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }
  function sizeOptsFor(c) {
    /* المقاسات من اللون المختار حصراً — لا خلط مع ألوان أخرى */
    const col = (c.color || '').trim() || NOCOLOR;
    const set = new Set(
      modelMates(c)
        .filter((x) => x.qty > 0 && ((x.color || '').trim() || NOCOLOR) === col)
        .map((x) => String(x.size || '').trim() || '—')
    );
    return [...set].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
  }
  /* ألوان الموديل كلها مع كمياتها — تظهر في بطاقة البيع */
  function modelColorsOf(p) {
    const map = new Map();
    for (const x of modelMates(p)) {
      const label = (x.color || '').trim() || NOCOLOR;
      const cur = map.get(label) || { label, qty: 0 };
      cur.qty += x.qty || 0;
      map.set(label, cur);
    }
    return [...map.values()].map((v) => ({ ...v, hex: v.label === NOCOLOR ? '#d8cfc9' : hexForColor(v.label, opts.colors) }));
  }
  /* the line's sku must follow the chosen color/size — it IS the shelf card */
  function rekeyLine(c) {
    /* بعد تغيير اللون: يبقى السطر داخل اللون المختار فقط */
    const col = (c.color || '').trim() || NOCOLOR;
    const sz = String(c.size || '').trim();
    const inColor = modelMates(c).filter((x) => x.qty > 0 && ((x.color || '').trim() || NOCOLOR) === col);
    const match = inColor.find((x) => String(x.size || '').trim() === sz) || inColor[0];
    if (!match) {
      /* اللون المختار نفد كلياً — يُحذف السطر بدل القفز لسطر لون آخر */
      cart = cart.filter((x) => x !== c);
      toastErr('نفد هذا اللون — حُذف السطر');
      buzz([20, 40, 20]);
      return;
    }
    c.sku = match.sku;
    c.cost = match.cost ?? c.cost;
    c.max = match.qty || 0;
    c.color = (match.color || '').trim();
    c.size = String(match.size || '').trim();
    c.vsKey = `${c.sku}|${c.color}|${c.size}`;
    if (c.qty > c.max) { c.qty = c.max; if (!c.qty) cart = cart.filter((x) => x !== c); }
    /* another line already sells this exact variant → merge into it */
    const twin = cart.find((x) => x !== c && x.vsKey === c.vsKey);
    if (twin) {
      twin.qty = Math.min(twin.qty + c.qty, twin.max);
      cart = cart.filter((x) => x !== c);
      toast('اندمجت مع سطر نفس المقاس');
    }
    buzz(6);
  }

  /* ---- Checkout — خطوتان: القطع ثم التوصيل والمراجعة ---- */
  let checkout = $state(false);
  let step = $state(1);
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

  /* زبونات محفوظات: تتجمع من مبيعاتها السابقة — الأحدث أولاً. لمسة على الاسم
     وتُعبّى الحقول كلها (الاسم، الهاتف، المحافظة، العنوان) بلا إعادة كتابة */
  const savedCustomers = $derived.by(() => {
    const map = new Map();
    for (const s of [...sales].sort((a, b) => new Date(b.date) - new Date(a.date))) {
      const phone = String(s.customerPhone || '').replace(/\D/g, '');
      if (!phone) continue;
      const cur = map.get(phone);
      if (cur) { cur.orders++; continue; }
      map.set(phone, {
        phone: String(s.customerPhone || '').trim(),
        name: (s.customerName || '').trim(),
        province: s.province || '',
        address: s.address || '',
        orders: 1
      });
    }
    return [...map.values()].slice(0, 6);
  });
  const phoneDigits = $derived(cphone.replace(/\D/g, ''));

  function pickCustomer(c) {
    cname = c.name;
    cphone = c.phone;
    cprovince = PROVINCES.includes(c.province) ? c.province : '';
    caddress = c.address || '';
    tried = false;
    buzz(8);
    toast(`بيانات ${c.name || c.phone} جاهزة`);
  }

  function gotoStep2() {
    if (!cart.length) return;
    step = 2;
    buzz(8);
  }

  /* الحقول الثلاثة الإجبارية: الاسم، موبايل صحيح (10 أرقام على الأقل)، المحافظة */
  const nameValid = $derived(cname.trim().length > 0);
  const phoneValid = $derived(phoneDigits.length >= 10 && phoneDigits.length <= 15);
  const provinceValid = $derived(cprovince !== '');
  const clientValid = $derived(nameValid && phoneValid && provinceValid);
  const missingClient = $derived([
    ...(!nameValid ? ['اسم الزبون'] : []),
    ...(!phoneValid ? ['رقم موبايل صحيح'] : []),
    ...(!provinceValid ? ['المحافظة'] : [])
  ]);

  async function openCheckout() {
    if (!cart.length) return;
    fee = await getSetting('deliveryFee', 5000);
    companies = await getSetting('deliveryCompanies', []);
    /* أول شركة جاهزة مُختارة سلفاً — لا «بدون» في الإتمام */
    if (!company && companies.length) company = companies[0];
    step = 1;
    tried = false;
    checkout = true;
    buzz(10);
  }

  function closeCheckout() {
    checkout = false;
    step = 1;
    tried = false;
  }

  /* تأكيد البيع: تحقق حقيقي قبل الحفظ — وأول حقل ناقص يُمرَّر إليه بعينها */
  function confirmCheckout() {
    if (!clientValid) {
      tried = true;
      buzz([30, 40, 30]);
      toastErr(`مطلوب قبل التأكيد: ${missingClient.join(' - ')}`);
      setTimeout(() => document.querySelector('.co-bad')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
      return;
    }
    finishSale();
  }

  /* cart bar portal — pinned to the viewport, immune to the screen transform */
  let barHost = $state(null);
  $effect(() => {
    if (!barHost) return;
    document.body.appendChild(barHost);
    /* same leak-proofing as the FAB portal: without this the bar haunts other tabs */
    return () => barHost.remove();
  });

  /* لو أُفرغت السلة خلف الورقة المفتوحة (نفدت الكميات) — تُغلق بهدوء */
  $effect(() => {
    if (checkout && !cart.length) { checkout = false; step = 1; }
  });

  async function finishSale() {
    if (saving) return;
    saving = true;
    try {
      const sale = await recordSale({
        items: cart.map((c) => ({ sku: c.sku, name: c.name, type: c.type || '', typeSub: c.typeSub || '', typeSub2: c.typeSub2 || '', typeSub3: c.typeSub3 || '', price: c.price, cost: c.cost, qty: c.qty, color: c.color || '', size: c.size || '' })),
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
      step = 1;
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
        <Dropdown bind:value={f.availSell} options={AVAIL} icon="box" placeholder="الحالة: متوفر" />
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

  <div class="muted small sort-note">
    {fmtNum(filtered.length)} موديل{f.cat !== 'الكل' ? ` في ${f.cat}` : ''}{f.availSell === 'out' ? ' (نفد)' : ''}
  </div>

  {#if filtered.length === 0}
    <EmptyState
      title={isDefault ? (products.length ? 'لا شيء متوفر حالياً' : 'لا موديلات للبيع') : 'لا نتائج مطابقة'}
      subtitle={isDefault ? (products.length ? 'كل الموديلات نفدت — استكملي الكميات من المخزون أولاً' : 'أضيفي موديلات أولاً من تبويب المخزون') : 'الموديلات موجودة لكن الفلاتر الحالية تخفيها'}
      actionLabel={isDefault ? 'إلى المخزون' : 'عرض الكل'}
      onaction={isDefault ? () => goto('inventory') : clearAllFilters}
      icon={isDefault ? 'box' : 'search'}
    />
  {:else}
    <div class="grid">
      {#each filtered as p, i (p.sku)}
        {@const gqty = modelQty.get(modelGroupKey(p)) || 0}
        <Glass
          as="button"
          class="pcard rise {gqty === 0 ? 'oos' : ''}"
          style="animation-delay:{Math.min(i * 0.04, 0.4)}s"
          onlongpress={(e) => openPickerFor(p)}
          onclick={(e) => addToCart(p, e?.currentTarget)}
        >
          <div class="pthumb">
            {#if p.photo}<img src={p.photo} alt={p.name} />{:else}<Icon name="box" size={24} color="var(--taupe)" />{/if}
          </div>
          <div class="pinfo">
            <!-- سلسلة النوع بعرض كامل وتلتف أسطراً — كل التفاصيل تُقرأ -->
            <div class="pname">{p.modelChain || p.type || p.name}</div>
            <div class="pcolors">
              {#each modelColorsOf(p) as cc (cc.label)}
                <span class="pc-color">
                  <i class="pdot" style="background:{cc.hex}"></i>
                  <span class="pc-qty">{fmtNum(cc.qty)}</span>
                </span>
              {/each}
            </div>
            <div class="psizes muted tiny">مقاسات: {sizesLabel(p)}</div>
          </div>
          <!-- السعر بجوار خاتم الإضافة -->
          <div class="psum">
            <span class="pprice">{fmtIQD(p.price)}</span>
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
      <button class="cart-info" onclick={() => { buzz(8); openCheckout(); }}>
        <span class="cart-badge pop alive">{fmtNum(cartCount)}</span>
        <div class="cart-txt">
          <div class="bold">متابعة البيع</div>
          <div class="muted small">{fmtNum(cart.length)} سطر — {fmtIQD(subtotal)}</div>
        </div>
        <span class="cart-go"><Icon name="back" size={17} /></span>
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
          <div class="muted small">{fmtNum(lastCount)} عناصر - {fmtIQD(lastSum)}</div>
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
    else toastErr('لا يوجد موديل بهذا الكود — أضيفي الباركود من تفاصيل الموديل');
  }}
/>

<!-- Shipment scanner (captures the delivery company's barcode) -->
<Scanner open={scanOpen} title="باركود شركة التوصيل" onclose={() => (scanOpen = false)}
  onscan={(code) => {
    scanOpen = false;
    barcode = code;
  }}
/>

<!-- Variant picker: اختاري الألوان والمقاسات المتوفرة قبل إتمام البيع -->
<Sheet open={vOpen} title={vpick ? vpick.name : ''} onclose={() => { vOpen = false; vpick = null; pk = {}; }}>
  {#if vpick}
    <div class="stack" style="gap:12px">
      <p class="muted small" style="margin:0">اختاري الكمية لكل لون ومقاس متوفر — تُضاف للسلة كما حددتِها.</p>
      {#each vpick.variants as v (vsKey(v))}
        {@const k = vsKey(v)}
        <Glass class="vrow" radius="var(--r-md)">
          <div class="v-info">
            <div class="bold small">{v.color}{v.size !== '—' ? ` - مقاس ${v.size}` : ''}</div>
            <div class="muted tiny">متوفر {fmtNum(freeOf(v))} قطعة</div>
          </div>
          <div class="stepper">
            <button class="stp" onclick={() => bump(v, -1)} disabled={!pk[k]}>−</button>
            <span class="qn">{pk[k] || 0}</span>
            <button class="stp" onclick={() => bump(v, +1)} disabled={freeOf(v) === 0}>+</button>
          </div>
        </Glass>
      {/each}
      <button class="btn primary lg block" onclick={confirmVariants} disabled={!Object.keys(pk).length}>
        <Icon name="check" size={20} />
        أضيفي للسلة ({Object.values(pk).reduce((a, b) => a + b, 0)} قطعة)
      </button>
    </div>
  {/if}
</Sheet>

<!-- Checkout — خطوتان: القطع ثم التوصيل والمراجعة -->
<Sheet open={checkout} title={step === 1 ? 'إتمام البيع — القطع' : 'إتمام البيع — التوصيل'} onclose={closeCheckout}>
  {#if step === 1}
  <div class="stack" style="gap:12px">
    <div class="step-track">
      <span class="st-item on"><i class="st-dot"></i>القطع</span>
      <span class="st-thread"></span>
      <span class="st-item"><i class="st-dot"></i>التوصيل</span>
    </div>
    {#each cart as c (c.vsKey)}
      {@const cph = products.find((x) => x.sku === c.sku)?.photo}
      <Glass class="citem" radius="var(--r-md)">
        <div class="ci-info">
          <div style="display:flex; gap:8px; align-items:center">
            <span class="ci-thumb">{#if cph}<img src={cph} alt="" />{:else}<Icon name="image" size={14} color="var(--taupe)" />{/if}</span>
            <VariantBits variants={[c]} />
          </div>
          <!-- لكل سطر اختيار اللون والمقاس من المتاح فقط -->
          <div class="ci-variants">
            <Pick
              bind:value={c.color}
              size="sm"
              disabled={colorOptsFor(c).length <= 1}
              options={colorOptsFor(c).map((o) => ({ v: o === NOCOLOR ? '' : o, l: o }))}
              valOf={(o) => o.v}
              labelOf={(o) => o.l}
              onchange={() => { c.size = ''; rekeyLine(c); }}
            />
            <Pick
              bind:value={c.size}
              size="sm"
              disabled={sizeOptsFor(c).length <= 1}
              options={sizeOptsFor(c).map((o) => ({ v: o === '—' ? '' : o, l: o === '—' ? 'مقاس واحد' : `مقاس ${o}` }))}
              valOf={(o) => o.v}
              labelOf={(o) => o.l}
              onchange={() => rekeyLine(c)}
            />
          </div>
          <div class="muted small">{fmtIQD(c.price)} × {c.qty} = <span class="money">{fmtIQD(c.price * c.qty)}</span></div>
        </div>
        <div class="stepper">
          <button class="stp" onclick={() => setQty(c, -1)}>−</button>
          <span class="qn">{c.qty}</span>
          <button class="stp" onclick={() => setQty(c, +1)}>+</button>
        </div>
      </Glass>
    {/each}

    <div class="sumline">
      <span class="muted small">{fmtNum(cart.length)} سطر — {fmtNum(cartCount)} قطعة</span>
      <span class="money">{fmtIQD(subtotal)}</span>
    </div>
    <button class="btn primary lg block" onclick={gotoStep2}>
      متابعة للتوصيل
      <Icon name="back" size={17} />
    </button>
  </div>
  {:else}
  <div class="stack" style="gap:12px">
    <div class="step-track">
      <span class="st-item"><i class="st-dot"></i>القطع</span>
      <span class="st-thread"></span>
      <span class="st-item on"><i class="st-dot"></i>التوصيل</span>
    </div>
    <button class="step-back" onclick={() => { step = 1; buzz(6); }}>
      <Icon name="undo" size={13} /> رجوع للقطع
    </button>

    {#if savedCustomers.length}
      <div class="field">
        <label>زبونات محفوظات <span class="muted tiny">(لمسة وتتعبى)</span></label>
        <div class="row wrap" style="gap:6px">
          {#each savedCustomers as c (c.phone)}
            <button type="button" class="chip" class:on={phoneDigits === c.phone.replace(/\D/g, '')} onclick={() => pickCustomer(c)}>
              {c.name || c.phone}
              <b class="ch-ord">{fmtNum(c.orders)}</b>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1" class:co-bad={tried && !nameValid}>
        <label>اسم الزبون <span class="req">*</span></label>
        <input class="input" bind:value={cname} class:invalid={tried && !nameValid} placeholder="الاسم الكامل" />
        {#if tried && !nameValid}<span class="err">الاسم مطلوب</span>{/if}
      </div>
      <div class="field" style="flex:1" class:co-bad={tried && !phoneValid}>
        <label>هاتف الزبون <span class="req">*</span></label>
        <input class="input" bind:value={cphone} inputmode="tel" class:invalid={tried && !phoneValid} placeholder="07xx…" />
        {#if tried && !phoneValid}<span class="err">رقم موبايل صحيح مطلوب (10 أرقام على الأقل)</span>{/if}
      </div>
    </div>

    <div class="row" style="gap:10px">
      <div class="field" style="flex:1" class:co-bad={tried && !provinceValid}>
        <label>المحافظة <span class="req">*</span></label>
        <Pick
          bind:value={cprovince}
          invalid={tried && !provinceValid}
          placeholder="اختاري المحافظة…"
          options={PROVINCES}
        />
        {#if tried && !provinceValid}<span class="err">المحافظة مطلوبة</span>{/if}
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
        <label>أجور التوصيل (د.ع)</label>
        <input class="input" bind:value={fee} inputmode="decimal" />
      </div>
      <div class="field" style="flex:1">
        <label>شركة التوصيل</label>
        {#if companies.length}
          <Pick bind:value={company} placeholder="اختاري الشركة…" options={companies} />
        {:else}
          <Pick placeholder="لا شركات بعد" disabled options={[]} />
          <button class="btn block" style="margin-top:6px" onclick={() => { buzz(8); goto('ledger'); }}>
            <Icon name="plus" size={15} /> ضيفي شركاتك من حساب شركات التوصيل
          </button>
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

    <!-- مراجعة الطلب قبل التأكيد: القطع، ثم الحساب -->
    <Glass class="review" radius="var(--r-md)">
      <div class="rv-head">
        <span class="bold small">مراجعة الطلب</span>
        <span class="rv-count">{fmtNum(cartCount)} قطعة — {fmtNum(cart.length)} سطر</span>
      </div>
      <div class="rv-lines">
        {#each cart as c (c.vsKey)}
          <div class="rv-line">
            <VariantBits variants={[c]} />
            <span class="rv-title">{[c.type, c.typeSub, c.typeSub2, c.typeSub3].filter(Boolean).join(' - ') || c.name}</span>
            <span class="rv-qty">× {fmtNum(c.qty)}</span>
            <span class="rv-sum">{fmtIQD(c.price * c.qty)}</span>
          </div>
        {/each}
      </div>
      <div class="rv-totals">
        <div class="row" style="justify-content:space-between"><span class="muted">المجموع</span><span class="money">{fmtIQD(subtotal)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted">التوصيل</span><span class="money">{fmtIQD(iqd(fee))}</span></div>
        <div class="row" style="justify-content:space-between">
          <span class="bold">الإجمالي</span>
          <span class="bold" style="font-size:18px; color:var(--burgundy)">{fmtIQD(subtotal + iqd(fee))}</span>
        </div>
      </div>
    </Glass>

    {#if tried && missingClient.length}
      <div class="comiss pop">مطلوب قبل التأكيد: {missingClient.join(' - ')}</div>
    {/if}

    <button class="btn primary lg block" onclick={confirmCheckout} disabled={saving || !cart.length}>
      <Icon name="check" size={20} /> تأكيد البيع
    </button>
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

  .f-row { display: flex; gap: 8px; }
  .f-row > :global(.dd) { flex: 1; min-width: 0; }
  .sort-note { margin-top: -4px; }

  .grid { display: flex; flex-direction: column; gap: 10px; padding-bottom: 150px; }
  .pdot {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 50%; border: 1px solid var(--line-2);
    margin-inline-end: 4px; vertical-align: -1px;
  }

  /* ── بطاقات البيع: صف هادئ بلا خطوط — الصورة والنوع والسعر والخاتم ── */
  :global(.pcard) {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: right;
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.pcard:active) { transform: scale(0.985); }
  :global(.pcard.oos) { opacity: 0.6; }
  .pthumb {
    width: 68px; height: 68px;
    border-radius: 14px;
    flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.65), rgba(181, 73, 91, 0.07));
    border: 1.5px solid rgba(201, 161, 90, 0.45); /* خيط الصورة الذهبي */
    box-shadow: 0 0 0 3px rgba(201, 161, 90, 0.07), 0 3px 10px rgba(58, 26, 32, 0.08);
    overflow: hidden;
  }
  .pthumb img { width: 100%; height: 100%; object-fit: cover; }
  :global(.pcard.oos) .pthumb img { filter: grayscale(0.55); }
  .pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .pcolors { display: flex; flex-wrap: wrap; gap: 3px 10px; }
  .pc-color { display: inline-flex; align-items: center; gap: 4px; }
  .pc-qty { font-size: 10.5px; font-weight: 800; color: var(--taupe); font-variant-numeric: tabular-nums; }
  .pname { font-weight: 800; font-size: 14px; color: var(--ink); line-height: 1.55; word-break: break-word; }
  .psizes { margin-top: 0; }
  /* السعر بجوار خاتم الإضافة */
  .psum { flex: none; display: flex; flex-direction: column; align-items: flex-end; }
  .pprice { font-weight: 900; font-size: 15px; color: var(--burgundy); font-variant-numeric: tabular-nums; letter-spacing: 0.2px; }
  /* خاتم الإضافة: دائرة نبيتية بإطار ذهبي — تُختم تحت الإصبع */
  .add-ic {
    flex: none;
    width: 38px; height: 38px;
    border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    border: 1.5px solid rgba(201, 161, 90, 0.6);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(181, 73, 91, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.pcard:active) .add-ic { transform: scale(0.86) rotate(-6deg); }

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
    padding: 11px 8px 8px; /* أعلى أوسع قليلاً — خياطة الإيصال تسكن فيها */
    border-radius: 20px;
    z-index: 45;
  }
  /* خياطة الإيصال: خط ذهبي متقطع أعلى الشريط — فاتورة تُكتب الآن */
  .cartbar::before {
    content: '';
    position: absolute;
    top: 5px;
    inset-inline: 16px;
    border-top: 1.5px dashed rgba(201, 161, 90, 0.5);
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
  .cart-go {
    flex: none;
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    color: #fff;
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
  /* نبض السلة: الشارة تتنفس بهدوء ما دامت فيها قطع — تبدأ بعد سكون الأربعين الثانية */
  :global(.cart-badge.alive) {
    animation:
      pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both,
      cart-breathe 2.6s ease-in-out 0.8s infinite;
  }
  @keyframes cart-breathe {
    0%, 100% { transform: scale(1); box-shadow: 0 6px 16px rgba(181, 73, 91, 0.4); }
    50% { transform: scale(1.05); box-shadow: 0 8px 22px rgba(181, 73, 91, 0.62); }
  }
  /* المناداة اللطيفة للسلة الناسية — مرة واحدة، لا إلحاح */
  :global(.cartbar.nudge) { animation: cart-nudge 0.7s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes cart-nudge {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-8px) rotate(-0.5deg); }
    45% { transform: translateX(7px) rotate(0.4deg); }
    70% { transform: translateX(-3px); }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.cart-badge.alive), :global(.cartbar.nudge) { animation: none; }
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
  .ci-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .ci-thumb {
    flex: none;
    width: 34px; height: 34px;
    border-radius: 9px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--line);
  }
  .ci-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .ci-variants { display: flex; gap: 6px; }
  .ci-variants > :global(.pk) { flex: 1; min-width: 0; width: auto; }
  :global(.vrow) {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 10px 12px;
  }
  .v-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
    transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .stp:active { transform: scale(0.85); }
  .qn { min-width: 22px; text-align: center; font-weight: 800; font-variant-numeric: tabular-nums; }

  :global(.totals) { padding: 12px 16px; border-radius: var(--r-md); display: flex; flex-direction: column; gap: 6px; }

  .req { color: var(--burgundy); font-weight: 800; }
  .err { display: block; font-size: 11px; color: var(--burgundy); font-weight: 700; margin-top: 3px; }
  :global(.invalid) { border-color: rgba(181, 73, 91, 0.55) !important; background: rgba(181, 73, 91, 0.05); }

  /* ── خطوتا الإتمام: خيط الدفتر يربط القطع بالتوصيل ── */
  .step-track { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
  .st-item { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: var(--taupe); }
  .st-item.on { color: var(--burgundy); }
  .st-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-2); flex: none; transition: background 0.2s, box-shadow 0.2s; }
  .st-item.on .st-dot { background: var(--burgundy); box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.15); }
  .st-thread { flex: 1; height: 1.5px; background: linear-gradient(to left, rgba(201, 161, 90, 0.15), rgba(201, 161, 90, 0.55)); }
  .step-back {
    align-self: flex-start;
    display: inline-flex; align-items: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: 12px; font-weight: 800;
    color: var(--burgundy); padding: 2px 4px;
  }
  /* عدّاد الطلبات داخل رقاقة الزبونة المحفوظة */
  .ch-ord {
    font-size: 9.5px; font-weight: 800; color: var(--burgundy);
    background: rgba(181, 73, 91, 0.12);
    border-radius: 999px; padding: 1px 6px; margin-inline-start: 5px;
    font-variant-numeric: tabular-nums;
  }
  /* إطار الحقل الناقص — العين تُمرَّر إليه عند التأكيد الفاشل */
  .co-bad { outline: 2px solid rgba(181, 73, 91, 0.45); outline-offset: 4px; border-radius: 12px; }
  .comiss {
    font-size: 12px; font-weight: 800; color: var(--burgundy-deep);
    background: var(--accent-soft);
    border: 1px solid rgba(181, 73, 91, 0.25);
    border-radius: 12px; padding: 9px 12px;
  }
  .sumline { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; }

  /* ── مراجعة الطلب: القطع ملخصة ثم الحساب — قبل التأكيد بآخر نظرة ── */
  :global(.review) { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
  .rv-head { display: flex; align-items: center; justify-content: space-between; }
  .rv-count { font-size: 10.5px; font-weight: 800; color: var(--taupe); font-variant-numeric: tabular-nums; }
  .rv-lines { display: flex; flex-direction: column; gap: 6px; max-height: 148px; overflow-y: auto; }
  .rv-line { display: flex; align-items: center; gap: 7px; font-size: 11.5px; }
  .rv-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); font-weight: 700; }
  .rv-qty { font-weight: 800; color: var(--taupe); font-variant-numeric: tabular-nums; flex: none; }
  .rv-sum { font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; flex: none; }
  .rv-totals { display: flex; flex-direction: column; gap: 6px; border-top: 1.5px dashed rgba(201, 161, 90, 0.45); padding-top: 9px; }
</style>
