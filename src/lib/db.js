import Dexie from 'dexie';
import { startOfToday, baghdadMonthKey, monthRange, salePieces } from './utils.js';

export const db = new Dexie('ghazala_boutique');

/* v2: + expenses, + reservations, sales gain deliveryCompany/settledAt/fromReservation.
   v1 installs upgrade in place (old sales get company '' = untracked). */
db.version(2).stores({
  products: 'sku, name, category, brand, color, size, qty, updatedAt',
  sales: '++id, date, status, customerName, customerPhone, barcode, deliveryCompany, settledAt, fromReservation',
  movements: '++id, sku, date, type',
  settings: 'key',
  expenses: '++id, date, category',
  reservations: '++id, sku, createdAt, expiresAt, status'
});

/* v3: + occasions (birthday/anniversary notes per customer) */
db.version(3).stores({
  products: 'sku, name, category, brand, color, size, qty, updatedAt',
  sales: '++id, date, status, customerName, customerPhone, barcode, deliveryCompany, settledAt, fromReservation',
  movements: '++id, sku, date, type',
  settings: 'key',
  expenses: '++id, date, category',
  reservations: '++id, sku, createdAt, expiresAt, status',
  occasions: '++id, customerName, customerPhone, month, day, date'
});

/* v4: + vault (خزنة الغزالة — every sale deposits its profit, returns withdraw)
   Entries never get edited — new ones appear next to old ones, so the vault
   history is a trustworthy ledger of what actually happened. */
db.version(4).stores({
  products: 'sku, name, category, brand, color, size, qty, updatedAt',
  sales: '++id, date, status, customerName, customerPhone, barcode, deliveryCompany, settledAt, fromReservation',
  movements: '++id, sku, date, type',
  settings: 'key',
  expenses: '++id, date, category',
  reservations: '++id, sku, createdAt, expiresAt, status',
  occasions: '++id, customerName, customerPhone, month, day, date',
  vault: '++id, date, saleId, kind'
});

export const DEFAULT_CATEGORIES = ['نسائية', 'رجالية', 'أطفال'];
export const WOMENS_TYPES = ['بوت', 'سلامبر', 'موال', 'كعب عالي'];

/* Editable model vocabulary (المزيد ← خيارات الموديلات). Seeded defaults
   only — the shop owner's own lists live in settings. */
export const DEFAULT_TYPES = [...WOMENS_TYPES];
export const DEFAULT_SEASONS = ['شتائي', 'صيفي'];
export const DEFAULT_MATERIALS = ['جلد طبيعي', 'جلد صناعي', 'قماش', 'سويد', 'بلاستيك'];

/* Starting size grid per category — always extendable with custom sizes */
export const SIZE_RUNS = {
  'نسائية': ['36', '37', '38', '39', '40', '41'],
  'رجالية': ['40', '41', '42', '43', '44', '45'],
  'أطفال': ['26', '28', '30', '32', '34']
};

/* One-tap palette — tap a circle instead of typing the color name */
export const COLOR_SWATCHES = [
  { label: 'أسود', hex: '#242124' },
  { label: 'بيج', hex: '#d8c3a5' },
  { label: 'وردي', hex: '#e8a3ab' },
  { label: 'أبيض', hex: '#f7f2ea', ring: true },
  { label: 'بني', hex: '#6b4a2f' },
  { label: 'ذهبي', hex: '#c9a24b' },
  { label: 'فضي', hex: '#b9bec3', ring: true },
  { label: 'كحلي', hex: '#232c49' },
  { label: 'أحمر', hex: '#a12433' },
  { label: 'بordo', hex: '#7a2e3a' },
  { label: 'خردلي', hex: '#b1a24e' },
  { label: 'أخضر', hex: '#3e6b4f' }
];

export const DEFAULT_SETTINGS = {
  deliveryFee: 5000,
  deadStockDays: 30,
  pin: null,
  categories: DEFAULT_CATEGORIES,
  types: DEFAULT_TYPES,
  seasons: DEFAULT_SEASONS,
  materials: DEFAULT_MATERIALS,
  modelColors: COLOR_SWATCHES,
  backupReminderAt: null,
  deliveryCompanies: [],
  waTemplate: null, // null → app default (see DEFAULT_WA_TEMPLATE in utils.js)
  dailyTarget: 0,      // قطع — daily goal ring on the dashboard (0 = off)
  vaultGoal: 500000,   // د.ع — the vault celebration threshold (0 = off)
  seasonMoods: null,   // { '2026-09': 'أعراس' } — مزاج الموسم per month
  moodCustom: [],      // كلمات مزاج من عند المستونة — تظهر كأزرار مع المعتادة
  archiveDays: 30,     // sold-out this long → المدينة القديمة (archive shelf)
  typeSubs: null,      // { 'بوت': ['كعب عالي','كعب قصير'] } — القائمة الثانية تحت النوع
  typeSubs2: null,     // { 'بوت': { 'كعب عالي': ['جيب جانبي',…] } } — القائمة الثالثة تحت التفصيل
  typeSubs3: null      // { 'بوت': { 'كعب عالي': { 'جيب جانبي': ['سحاب',…] } } } — القائمة الرابعة
};

export async function getSetting(key, fallback) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  /* Svelte $state proxies cannot be structured-cloned into IndexedDB — the put
     would silently reject. A JSON round-trip strips the proxy to a plain value. */
  await db.settings.put({ key, value: JSON.parse(JSON.stringify(value ?? null)) });
}

export async function allSettings() {
  const rows = await db.settings.toArray();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map };
}

/* The owner's model vocabulary (المزيد ← خيارات الموديلات) */
export async function modelOptions() {
  const s = await allSettings();
  return {
    categories: s.categories?.length ? s.categories : DEFAULT_CATEGORIES,
    types: s.types?.length ? s.types : DEFAULT_TYPES,
    seasons: s.seasons?.length ? s.seasons : DEFAULT_SEASONS,
    materials: s.materials?.length ? s.materials : DEFAULT_MATERIALS,
    colors: Array.isArray(s.modelColors) && s.modelColors.length ? s.modelColors : COLOR_SWATCHES,
    typeSubs: s.typeSubs && typeof s.typeSubs === 'object' ? s.typeSubs : {},
    typeSubs2: s.typeSubs2 && typeof s.typeSubs2 === 'object' ? s.typeSubs2 : {},
    typeSubs3: s.typeSubs3 && typeof s.typeSubs3 === 'object' ? s.typeSubs3 : {}
  };
}

/* القائمة الثانية تحت النوع: ['كعب عالي','كعب قصير'] لـ «بوت» */
export const subsOfType = (typeSubs, type) =>
  (type && typeSubs?.[type]) || [];

/* القائمة الثالثة تحت التفصيل: ['جيب جانبي',…] لـ «بوت ← كعب عالي» */
export const subsOfType2 = (typeSubs2, type, sub) =>
  (type && sub && typeSubs2?.[type]?.[sub]) || [];

/* القائمة الرابعة تحت تفصيل أدق */
export const subsOfType3 = (typeSubs3, type, sub, sub2) =>
  (type && sub && sub2 && typeSubs3?.[type]?.[sub]?.[sub2]) || [];
/* resolve a color label to its hex dot (for cards and size-runs) */
export const hexForColor = (label, colors) =>
  (colors || COLOR_SWATCHES).find((c) => (c.label || '').trim().toLowerCase() === String(label || '').trim().toLowerCase())?.hex || 'var(--taupe)';

/* ---------------- Products ---------------- */

export async function nextSku() {
  const all = await db.products.orderBy('sku').last();
  let n = 0;
  if (all && /^GHZ-\d+$/.test(all.sku)) n = parseInt(all.sku.slice(4), 10) || 0;
  let sku;
  do {
    n += 1;
    sku = 'GHZ-' + String(n).padStart(4, '0');
  } while (await db.products.get(sku));
  return sku;
}

/* Internal model number — M-0001, M-0002 … exactly like the SKU but for the
   MODEL (all its colors × sizes). It is the stable grouping key: the photo is
   the identity the user sees, this number is the identity the app knows.
   Never shown anywhere — it lives only inside the records. */
export async function nextModelId() {
  const n = (await getSetting('modelIdSeq', 0)) + 1;
  await setSetting('modelIdSeq', n);
  return 'M-' + String(n).padStart(4, '0');
}

export async function addProduct(data, { moveNote } = {}) {
  const sku = data.sku || (await nextSku());
  const now = new Date().toISOString();
  const p = {
    name: '', category: 'نسائية', brand: '', color: '', size: '', type: '', season: '', material: '',
    cost: 0, price: 0, qty: 0, barcode: '', notes: '', photo: null,
    supplier: '', supplierAt: null,
    ...data, sku, createdAt: now, updatedAt: now
  };
  if (!p.modelId) p.modelId = await nextModelId();
  delete p.id;
  await db.products.put(p);
  if (p.qty > 0) await logMovement({ sku, type: 'in', qty: p.qty, note: moveNote || 'إضافة أولية' });
  return p;
}

export async function updateProduct(sku, changes, moveNote) {
  const before = await db.products.get(sku);
  if (!before) throw new Error('المنتج غير موجود');
  const now = new Date().toISOString();
  const p = { ...before, ...changes, sku, updatedAt: now };
  const diff = (Number(changes.qty ?? before.qty) || 0) - before.qty;
  /* pieces went back on the shelf → the راكد clock restarts from here */
  if (diff > 0) p.restockedAt = now;
  const oosSince = applyOosStamp(before, p);
  if (oosSince !== undefined) p.oosSince = oosSince;
  await db.products.put(p);
  if (diff !== 0) {
    await logMovement({
      sku, type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff),
      note: moveNote || (diff > 0 ? 'تعديل يدوي — زيادة' : 'تعديل يدوي — نقصان')
    });
  }
  return p;
}

export async function adjustQty(sku, delta, note) {
  const p = await db.products.get(sku);
  if (!p) throw new Error('المنتج غير موجود');
  const q = Math.max(0, (Number(p.qty) || 0) + delta);
  const patch = { qty: q, updatedAt: new Date().toISOString() };
  if (delta > 0) patch.restockedAt = patch.updatedAt;
  const oosSince = applyOosStamp(p, { ...p, qty: q });
  if (oosSince !== undefined) patch.oosSince = oosSince;
  await db.products.update(sku, patch);
  if (delta !== 0) {
    await logMovement({
      sku, type: delta > 0 ? 'in' : 'out', qty: Math.abs(delta),
      note: note || (delta > 0 ? 'إضافة مخزون' : 'خصم مخزون')
    });
  }
  return q;
}

export async function deleteProduct(sku) {
  await db.products.delete(sku);
}

/* One-time convergence: every visual model (same name+category) shares ONE
   internal modelId — legacy cards adopt the first id found in their group,
   and groups without any id get a fresh one. Idempotent; cheap at boot. */
export async function backfillModelIds() {
  const all = await db.products.toArray();
  const groups = new Map();
  for (const p of all) {
    const k = `${(p.name || '').trim().toLowerCase()}|${p.category || ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  for (const members of groups.values()) {
    const existing = members.find((m) => m.modelId)?.modelId;
    const mid = existing || (await nextModelId());
    for (const m of members) {
      if (m.modelId !== mid) await db.products.update(m.sku, { modelId: mid });
    }
  }
}

/* delete a whole model (every color × size card of it) in one go */
export async function deleteProducts(skus) {
  await db.products.bulkDelete(skus);
}

export async function logMovement({ sku, type, qty, note }) {
  return db.movements.add({ sku, type, qty, note: note || '', date: new Date().toISOString() });
}

/* ---------------- Batch receiving (فاتورة الوارد) ----------------
   One supplier invoice → many models × sizes. Lines expand into per-size
   products; a size that already exists (same name+category+color+size) is
   merged into — never duplicated. The supplier name rides on the product
   and into every movement note, so «منين شريت هذا؟» is answerable forever. */

/* Twin-detection for merging a received size into an existing card.
   Prefer the internal modelId (stable across renames/restocks); fall back to
   the name-based key for legacy cards — and when a legacy twin is found the
   caller backfills the modelId so the model converges onto its number. */
export const modelKey = (p) =>
  `${(p.name || '').trim().toLowerCase()}|${p.category || ''}|${String(p.size || '').trim()}|${(p.color || '').trim()}`;
export const sameModel = (a, b) =>
  (a.modelId && b.modelId) ? a.modelId === b.modelId : modelKey(a) === modelKey(b);
/* The grouping key for one MODEL (all colors × sizes = one card) */
export const modelGroupKey = (p) => p.modelId || `${(p.name || '').trim().toLowerCase()}|${p.category || ''}`;

export async function receiveBatch({ supplier = '', invoice = '', note = '', lines = [] }) {
  const sup = supplier.trim();
  const invNote = sup ? `فاتورة وارد${invoice ? ` #${invoice.trim()}` : ''} — ${sup}` : 'فاتورة وارد';
  const all = await db.products.toArray();
  const idx = new Map(all.map((p) => [modelKey(p), p]));
  let added = 0, merged = 0, pieces = 0;
  const touchedSkus = [];
  for (const ln of lines) {
    const name = (ln.name || '').trim();
    if (!name) continue;
    /* one modelId per invoice line — every size of the line is the same model */
    const lineModelId = ln.modelId || (await nextModelId());
    for (const [size, rawQty] of Object.entries(ln.sizes || {})) {
      const qty = Math.max(0, Math.round(Number(rawQty) || 0));
      const sz = String(size).trim();
      if (!qty || !sz) continue;
      const twin = idx.get(modelKey({ name, category: ln.category, size: sz, color: ln.color }));
      if (twin) {
        await updateProduct(twin.sku, {
          qty: (twin.qty || 0) + qty,
          cost: Number(ln.cost) || twin.cost,
          price: Number(ln.price) || twin.price,
          type: ln.type || twin.type || '',
          typeSub: ln.typeSub || twin.typeSub || '',
          typeSub2: ln.typeSub2 || twin.typeSub2 || '',
          typeSub3: ln.typeSub3 || twin.typeSub3 || '',
          season: ln.season || twin.season || '',
          material: ln.material || twin.material || '',
          supplier: sup || twin.supplier || '',
          supplierAt: new Date().toISOString(),
          photo: twin.photo || ln.photo || null,
          /* legacy card → adopt the line's model number so the model converges */
          modelId: twin.modelId || lineModelId
        }, invNote + (note ? ` — ${note}` : ''));
        twin.qty += qty;
        if (!twin.modelId) { twin.modelId = lineModelId; idx.set(modelKey({ ...twin }), twin); }
        merged++; pieces += qty; touchedSkus.push(twin.sku);
      } else {
        const p = await addProduct({
          name, category: ln.category || 'نسائية', type: ln.type || '',
          typeSub: ln.typeSub || '', typeSub2: ln.typeSub2 || '', typeSub3: ln.typeSub3 || '',
          season: ln.season || '', material: ln.material || '',
          color: (ln.color || '').trim(), size: sz,
          cost: Number(ln.cost) || 0, price: Number(ln.price) || 0, qty,
          photo: ln.photo || null, supplier: sup, supplierAt: new Date().toISOString(),
          notes: note || '', modelId: lineModelId
        }, { moveNote: invNote + (note ? ` — ${note}` : '') });
        idx.set(modelKey(p), p);
        added++; pieces += qty; touchedSkus.push(p.sku);
      }
    }
  }
  return { added, merged, pieces, touchedSkus };
}

/* ---------------- Sales ---------------- */

export async function recordSale({ items, customerName, customerPhone, province, address, deliveryFee, barcode, status, deliveryCompany, fromReservation, stockDeducted }) {
  const now = new Date().toISOString();
  let subtotal = 0, cost = 0;
  for (const it of items) {
    subtotal += (Number(it.price) || 0) * it.qty;
    cost += (Number(it.cost) || 0) * it.qty;
  }
  const fee = deliveryFee ?? (await getSetting('deliveryFee', 5000));
  const total = subtotal + fee;
  const sale = {
    date: now, items, subtotal, cost, profit: subtotal - cost,
    deliveryFee: fee, total,
    customerName: customerName || '', customerPhone: customerPhone || '',
    province: province || '', address: address || '',
    barcode: barcode || '', status: status || 'pending',
    deliveryCompany: deliveryCompany || '', settledAt: null,
    fromReservation: fromReservation ?? null, createdAt: now
  };
  const id = await db.sales.add(sale);
  for (const it of items) {
    const p = await db.products.get(it.sku);
    if (p && !stockDeducted) {
      const nq = Math.max(0, p.qty - it.qty);
      const patch = { qty: nq, updatedAt: now };
      const oosSince = applyOosStamp(p, { ...p, qty: nq });
      if (oosSince !== undefined) patch.oosSince = oosSince;
      await db.products.update(it.sku, patch);
    }
    await logMovement({ sku: it.sku, type: 'out', qty: it.qty, note: `بيع #${id}${fromReservation ? ' • من حجز' : ''}` });
  }
  await vaultDeposit({ amount: sale.profit, saleId: id, note: `بيع #${id}` });
  return { ...sale, id };
}

export async function setSaleStatus(id, status) {
  await db.sales.update(id, { status });
}

/* Pieces sold today (non-returned) — drives milestone celebrations */
export async function piecesSoldToday() {
  const from = startOfToday().getTime();
  const todays = await db.sales.where('date').above(new Date(from).toISOString()).toArray();
  return todays
    .filter((s) => s.status !== 'returned')
    .reduce((a, s) => a + (s.items || []).reduce((x, it) => x + (Number(it.qty) || 0), 0), 0);
}

/* تسوية — the delivery company handed over the cash for this package */
export async function settleSale(id) {
  await db.sales.update(id, { settledAt: new Date().toISOString() });
}

/* Money currently held by delivery companies (delivered but not yet settled) */
export async function moneyInTransit() {
  const sales = await db.sales.toArray();
  return sales
    .filter((s) => s.status !== 'returned' && !s.settledAt)
    .reduce((a, s) => a + (Number(s.total) || 0), 0);
}

export async function returnSale(id) {
  const s = await db.sales.get(id);
  if (!s || s.status === 'returned') return;
  const now = new Date().toISOString();
  for (const it of s.items) {
    const p = await db.products.get(it.sku);
    if (p) await db.products.update(it.sku, { qty: p.qty + it.qty, updatedAt: now });
    await logMovement({ sku: it.sku, type: 'in', qty: it.qty, note: `إرجاع بيع #${id}` });
  }
  await db.sales.update(id, { status: 'returned' });
  /* the sale's profit leaves the vault — recorded, never hidden */
  await vaultWithdraw({ amount: s.profit, saleId: id, note: `إرجاع بيع #${id}` });
}

/* ---------------- خزنة الغزالة (the vault) ----------------
   Every sale quietly drops its profit in; a return takes it back out.
   The balance is the sum of entries — nothing is ever overwritten, so
   the history doubles as an honest ledger. When the balance crosses
   vaultGoal (settings), the dashboard celebrates once per goal. */

export async function vaultDeposit({ amount, saleId = null, note = '' }) {
  if (!(Number(amount) > 0)) return;
  await db.vault.add({ date: new Date().toISOString(), kind: 'in', amount: Math.round(Number(amount)), saleId, note });
}

export async function vaultWithdraw({ amount, saleId = null, note = '' }) {
  if (!(Number(amount) > 0)) return;
  await db.vault.add({ date: new Date().toISOString(), kind: 'out', amount: Math.round(Number(amount)), saleId, note });
}

/* manual entry — vault money taken out (مشتريات، مصاريف شخصية…) */
export async function vaultManual(kind, amount, note) {
  const a = Math.round(Number(amount) || 0);
  if (a <= 0) return;
  await db.vault.add({ date: new Date().toISOString(), kind: kind === 'in' ? 'in' : 'out', amount: a, saleId: null, note: note || (kind === 'in' ? 'إيداع يدوي' : 'سحب') });
}

export async function vaultState() {
  const [entries, goal] = await Promise.all([db.vault.toArray(), getSetting('vaultGoal', 500000)]);
  const balance = entries.reduce((a, e) => a + (e.kind === 'in' ? e.amount : -e.amount), 0);
  const g = Math.max(0, Number(goal) || 0);
  /* celebrate exactly once per goal-crossing: stamp the moment in settings */
  let justReached = false;
  if (g > 0 && balance >= g) {
    const stamp = await getSetting('vaultCelebratedAt', null);
    const celebratedBalance = Number(stamp?.balance) || 0;
    if (celebratedBalance < g) {
      justReached = true;
      await setSetting('vaultCelebratedAt', { at: new Date().toISOString(), balance });
    }
  }
  return { balance, goal: g, entries: entries.sort((a, b) => new Date(b.date) - new Date(a.date)), justReached };
}

/* مسح السجل فقط (الميزانية تبقى محسوبة من الصفر) — من الشاشة نفسها */
export async function vaultClear() {
  await db.vault.clear();
  await setSetting('vaultCelebratedAt', null);
}

/* ---------------- المدينة القديمة (the archive shelf) ----------------
   Models whose every card has been sold-out (qty 0) for at least
   archiveDays (settings) — they stop counting as «نفد» noise in the
   dashboard and move to a quiet shelf with a «أعيدي طلبي منه» button. */

export function archivedModels(products, days) {
  const d = Math.max(1, Number(days) || 30);
  const cutoff = Date.now() - d * 86400000;
  const groups = new Map();
  for (const p of products) {
    const k = p.modelId || `${(p.name || '').trim().toLowerCase()}|${p.category || ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const out = [];
  for (const [key, members] of groups) {
    /* every card empty AND empty since before the cutoff */
    const emptySince = Math.max(...members.map((m) => {
      const t = m.oosSince ? new Date(m.oosSince).getTime() : new Date(m.updatedAt || m.createdAt || Date.now()).getTime();
      return t;
    }));
    if (members.every((m) => (m.qty || 0) === 0) && emptySince <= cutoff) {
      const rep = members.find((m) => m.photo) || members[0];
      out.push({ key, items: members, rep, qty: 0, emptySince });
    }
  }
  return out.sort((a, b) => a.emptySince - b.emptySince);
}

/* stamp oosSince the first time a card hits zero (cleared automatically when
   stock returns) — called from updateProduct/adjustQty/recordSale paths */
export function applyOosStamp(prev, next) {
  const wasEmpty = (Number(prev?.qty) || 0) === 0;
  const isEmpty = (Number(next?.qty) || 0) === 0;
  if (!wasEmpty && isEmpty) return new Date().toISOString();
  if (wasEmpty && !isEmpty) return null;
  return prev?.oosSince ?? null;
}

/* ---------------- Reservations (حجز) ----------------
   Stock is deducted immediately so no one else can sell it; if the
   reservation expires or is cancelled, the pieces go back to the shelf. */

export const RESERVATION_HOURS = 48;

export async function createReservation({ sku, customerName, customerPhone, note, hours = RESERVATION_HOURS }) {
  const p = await db.products.get(sku);
  if (!p) throw new Error('الموديل غير موجود');
  if (p.qty <= 0) throw new Error('لا توجد قطع متوفرة للحجز');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600000).toISOString();
  await db.products.update(sku, { qty: p.qty - 1, updatedAt: now.toISOString() });
  await logMovement({ sku, type: 'out', qty: 1, note: `حجز لـ ${customerName || 'زبونة'}` });
  const id = await db.reservations.add({
    sku, name: p.name, price: p.price,
    customerName: customerName || '', customerPhone: customerPhone || '',
    note: note || '',
    createdAt: now.toISOString(), expiresAt, status: 'active'
  });
  return id;
}

/* restore stock for an expired/cancelled reservation */
async function releaseReservation(r, note) {
  const p = await db.products.get(r.sku);
  if (p) await db.products.update(r.sku, { qty: p.qty + 1, updatedAt: new Date().toISOString() });
  await logMovement({ sku: r.sku, type: 'in', qty: 1, note });
}

export async function cancelReservation(id) {
  const r = await db.reservations.get(id);
  if (!r || r.status !== 'active') return;
  await releaseReservation(r, `إلغاء حجز #${id}`);
  await db.reservations.update(id, { status: 'cancelled' });
}

export async function expireReservation(id) {
  const r = await db.reservations.get(id);
  if (!r || r.status !== 'active') return;
  await releaseReservation(r, `انتهاء حجز #${id}`);
  await db.reservations.update(id, { status: 'expired' });
}

/* Convert an active reservation into a real sale (already-deducted stock stays deducted) */
export async function convertReservation(id, { deliveryFee, barcode, deliveryCompany, province, address } = {}) {
  const r = await db.reservations.get(id);
  if (!r || r.status !== 'active') throw new Error('الحجز غير صالح');
  const p = await db.products.get(r.sku);
  const sale = await recordSale({
    items: [{ sku: r.sku, name: r.name, price: r.price, cost: p?.cost ?? 0, qty: 1, color: p?.color || '', size: String(p?.size || '').trim() }],
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    province,
    address,
    deliveryFee,
    barcode,
    deliveryCompany,
    status: 'pending',
    fromReservation: id,
    stockDeducted: true
  });
  await db.reservations.update(id, { status: 'sold' });
  return sale;
}

/* Auto-expire overdue active reservations (call when listing them) */
export async function sweepExpiredReservations() {
  const now = Date.now();
  const active = await db.reservations.where('status').equals('active').toArray();
  for (const r of active) if (new Date(r.expiresAt).getTime() < now) await expireReservation(r.id);
}

/* ---------------- Expenses (المصاريف) ---------------- */

export const EXPENSE_CATEGORIES = ['إيجار', 'نقل', 'تغليف', 'كهرباء', 'أخرى'];

export async function addExpense({ amount, category, note }) {
  return db.expenses.add({
    amount: Math.max(0, Number(amount) || 0),
    category: category || 'أخرى',
    note: note || '',
    date: new Date().toISOString()
  });
}

export async function deleteExpense(id) {
  await db.expenses.delete(id);
}

/* ---------------- Stocktake ---------------- */

export async function stocktakeApply(corrections) {
  const now = new Date().toISOString();
  for (const c of corrections) {
    const p = await db.products.get(c.sku);
    if (!p) continue;
    const diff = c.counted - p.qty;
    const patch = { qty: Math.max(0, c.counted), updatedAt: now };
    if (diff > 0) patch.restockedAt = now;
    await db.products.update(c.sku, patch);
    if (diff !== 0) {
      await logMovement({ sku: c.sku, type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff), note: 'جرد' });
    }
  }
}

/* ---------------- Backup / Restore ---------------- */

export async function backupJSON() {
  const [products, sales, movements, settings, expenses, reservations, occasions, vault] = await Promise.all([
    db.products.toArray(), db.sales.toArray(), db.movements.toArray(), db.settings.toArray(),
    db.expenses.toArray(), db.reservations.toArray(), db.occasions.toArray(), db.vault.toArray()
  ]);
  return {
    app: 'ghazala-boutique', version: 4, exportedAt: new Date().toISOString(),
    products, sales, movements, settings, expenses, reservations, occasions, vault
  };
}

export async function restoreJSON(data, { merge = false } = {}) {
  if (!data || data.app !== 'ghazala-boutique') throw new Error('ملف النسخة غير صالح');
  if (!merge) {
    await db.transaction('rw', db.products, db.sales, db.movements, db.expenses, db.reservations, db.occasions, db.vault, async () => {
      await Promise.all([db.products.clear(), db.sales.clear(), db.movements.clear(), db.expenses.clear(), db.reservations.clear(), db.occasions.clear(), db.vault.clear()]);
    });
  }
  await db.products.bulkPut(data.products || []);
  await db.sales.bulkPut(data.sales || []);
  await db.movements.bulkPut(data.movements || []);
  if (Array.isArray(data.settings)) {
    await db.settings.bulkPut(data.settings.filter((s) => s.key !== 'waTemplate'));
  }
  if (Array.isArray(data.expenses)) await db.expenses.bulkPut(data.expenses);
  if (Array.isArray(data.reservations)) await db.reservations.bulkPut(data.reservations);
  if (Array.isArray(data.occasions)) await db.occasions.bulkPut(data.occasions);
  if (Array.isArray(data.vault)) await db.vault.bulkPut(data.vault);
}

export async function wipeAll() {
  await db.transaction('rw', db.products, db.sales, db.movements, db.expenses, db.reservations, db.occasions, db.vault, async () => {
    await Promise.all([db.products.clear(), db.sales.clear(), db.movements.clear(), db.expenses.clear(), db.reservations.clear(), db.occasions.clear(), db.vault.clear()]);
  });
}

/* ---------------- Occasions (birthday / anniversary notes) ---------------- */

/* An occasion repeats yearly: { customerName, customerPhone, label, month (1-12), day }.
   `label` examples: عيد ميلاد · ذكرى زواج · مناسبة خاصة. Upcoming 30-day list drives
   the daily briefing + a reminder chip; WhatsApp greeting opens from the row. */
export async function addOccasion({ customerName, customerPhone, label, month, day, note }) {
  return db.occasions.add({
    customerName: customerName || '',
    customerPhone: customerPhone || '',
    label: label || 'عيد ميلاد',
    month: Number(month),
    day: Number(day),
    note: note || '',
    createdAt: new Date().toISOString()
  });
}

export async function deleteOccasion(id) {
  return db.occasions.delete(id);
}

/* Days from today until the next occurrence of a (month, day) — 0 = today */
export function daysUntil(month, day, ref = new Date()) {
  const y = ref.getFullYear();
  let next = new Date(y, month - 1, day);
  const today = new Date(y, ref.getMonth(), ref.getDate());
  if (next < today) next = new Date(y + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
}

/* Occasions in the next `window` days, soonest first */
export async function upcomingOccasions(windowDays = 30) {
  const all = await db.occasions.toArray();
  return all
    .map((o) => ({ ...o, inDays: daysUntil(o.month, o.day) }))
    .filter((o) => o.inDays <= windowDays)
    .sort((a, b) => a.inDays - b.inDays);
}

/* ---------------- Monthly closing (دفتر الشهر) ----------------
   Once the Baghdad month rolls over, the previous month is auto-saved
   as an immutable mini-ledger: profit, revenue, pieces, additions,
   stock value at closing. Runs at app boot; never rewrites a closed month. */
export async function sweepMonthClosing() {
  try {
    const key = baghdadMonthKey(1); // last month — this one is still open
    const list = await getSetting('monthClosing', null);
    if (Array.isArray(list) && list.some((s) => s.month === key)) return;
    const [start, end] = monthRange(key);
    const inMonth = (iso) => { const t = new Date(iso).getTime(); return t >= start.getTime() && t < end.getTime(); };
    const [allSales, allProducts, allExpenses] = await Promise.all([db.sales.toArray(), db.products.toArray(), db.expenses.toArray()]);
    const active = allSales.filter((s) => s.status !== 'returned' && inMonth(s.date));
    const expenses = allExpenses.filter((e) => inMonth(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const added = allProducts.filter((p) => inMonth(p.createdAt || p.updatedAt));
    if (!active.length && !added.length && !expenses) return; // nothing happened — nothing to close
    const snap = {
      month: key,
      closedAt: new Date().toISOString(),
      count: active.length,
      pieces: active.reduce((a, s) => a + salePieces(s), 0),
      revenue: active.reduce((a, s) => a + (Number(s.subtotal) || 0), 0),
      profit: active.reduce((a, s) => a + (Number(s.profit) || 0), 0),
      expenses,
      modelsAdded: added.length,
      unitsAdded: added.reduce((a, p) => a + (Number(p.qty) || 0), 0),
      stockValue: allProducts.reduce((a, p) => a + (p.qty || 0) * (p.cost || 0), 0),
      stockUnits: allProducts.reduce((a, p) => a + (p.qty || 0), 0)
    };
    snap.net = snap.profit - snap.expenses;
    await setSetting('monthClosing', [...(list || []), snap].slice(-36));
  } catch (e) {
    console.error('sweepMonthClosing', e);
  }
}

/* ---------------- Demo data (اختياري للتجربة) ---------------- */

export async function seedDemo() {
  const demo = [
    { name: 'بوت جلد أسود', category: 'نسائية', brand: '', color: 'أسود', size: '37', cost: 18000, price: 32000, qty: 4 },
    { name: 'بوت جلد أسود', category: 'نسائية', brand: '', color: 'أسود', size: '38', cost: 18000, price: 32000, qty: 6 },
    { name: 'موال بيج كاجوال', category: 'نسائية', brand: '', color: 'بيج', size: '39', cost: 12000, price: 22000, qty: 3 },
    { name: 'سلامبر قطن وردي', category: 'نسائية', brand: '', color: 'وردي', size: '36', cost: 8000, price: 15000, qty: 5 },
    { name: 'كعب عالي ذهبي', category: 'نسائية', brand: '', color: 'ذهبي', size: '38', cost: 22000, price: 40000, qty: 2 },
    { name: 'حذاء رجالي كلاسيك', category: 'رجالية', brand: '', color: 'بني', size: '42', cost: 25000, price: 45000, qty: 4 }
  ];
  for (const d of demo) await addProduct(d);
}
