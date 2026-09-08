import Dexie from 'dexie';

export const db = new Dexie('ghazala_boutique');

db.version(1).stores({
  products: 'sku, name, category, brand, color, size, qty, updatedAt',
  sales: '++id, date, status, customerName, customerPhone, barcode',
  movements: '++id, sku, date, type',
  settings: 'key'
});

export const DEFAULT_CATEGORIES = ['نسائية', 'رجالية', 'أطفال'];
export const WOMENS_TYPES = ['بوت', 'سلامبر', 'موال', 'كعب عالي'];

export const DEFAULT_SETTINGS = {
  deliveryFee: 5000,
  lowStockThreshold: 3,
  deadStockDays: 30,
  pin: null,
  categories: DEFAULT_CATEGORIES,
  backupReminderAt: null
};

export async function getSetting(key, fallback) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

export async function allSettings() {
  const rows = await db.settings.toArray();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map };
}

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

export async function addProduct(data) {
  const sku = data.sku || (await nextSku());
  const now = new Date().toISOString();
  const p = {
    name: '', category: 'نسائية', brand: '', color: '', size: '',
    cost: 0, price: 0, qty: 0, barcode: '', notes: '', photo: null,
    ...data, sku, createdAt: now, updatedAt: now
  };
  delete p.id;
  await db.products.put(p);
  if (p.qty > 0) await logMovement({ sku, type: 'in', qty: p.qty, note: 'إضافة أولية' });
  return p;
}

export async function updateProduct(sku, changes) {
  const before = await db.products.get(sku);
  if (!before) throw new Error('المنتج غير موجود');
  const now = new Date().toISOString();
  const p = { ...before, ...changes, sku, updatedAt: now };
  await db.products.put(p);
  const diff = (Number(changes.qty ?? before.qty) || 0) - before.qty;
  if (diff !== 0) {
    await logMovement({
      sku, type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff),
      note: diff > 0 ? 'تعديل يدوي — زيادة' : 'تعديل يدوي — نقصان'
    });
  }
  return p;
}

export async function adjustQty(sku, delta, note) {
  const p = await db.products.get(sku);
  if (!p) throw new Error('المنتج غير موجود');
  const q = Math.max(0, (Number(p.qty) || 0) + delta);
  await db.products.update(sku, { qty: q, updatedAt: new Date().toISOString() });
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

export async function logMovement({ sku, type, qty, note }) {
  return db.movements.add({ sku, type, qty, note: note || '', date: new Date().toISOString() });
}

/* ---------------- Sales ---------------- */

export async function recordSale({ items, customerName, customerPhone, deliveryFee, barcode, status }) {
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
    barcode: barcode || '', status: status || 'pending', createdAt: now
  };
  const id = await db.sales.add(sale);
  for (const it of items) {
    const p = await db.products.get(it.sku);
    if (p) await db.products.update(it.sku, { qty: Math.max(0, p.qty - it.qty), updatedAt: now });
    await logMovement({ sku: it.sku, type: 'out', qty: it.qty, note: `بيع #${id}` });
  }
  return { ...sale, id };
}

export async function setSaleStatus(id, status) {
  await db.sales.update(id, { status });
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
}

/* ---------------- Stocktake ---------------- */

export async function stocktakeApply(corrections) {
  const now = new Date().toISOString();
  for (const c of corrections) {
    const p = await db.products.get(c.sku);
    if (!p) continue;
    const diff = c.counted - p.qty;
    await db.products.update(c.sku, { qty: Math.max(0, c.counted), updatedAt: now });
    if (diff !== 0) {
      await logMovement({ sku: c.sku, type: diff > 0 ? 'in' : 'out', qty: Math.abs(diff), note: 'جرد' });
    }
  }
}

/* ---------------- Backup / Restore ---------------- */

export async function backupJSON() {
  const [products, sales, movements, settings] = await Promise.all([
    db.products.toArray(), db.sales.toArray(), db.movements.toArray(), db.settings.toArray()
  ]);
  return {
    app: 'ghazala-boutique', version: 1, exportedAt: new Date().toISOString(),
    products, sales, movements, settings
  };
}

export async function restoreJSON(data, { merge = false } = {}) {
  if (!data || data.app !== 'ghazala-boutique') throw new Error('ملف النسخة غير صالح');
  if (!merge) {
    await db.transaction('rw', db.products, db.sales, db.movements, async () => {
      await Promise.all([db.products.clear(), db.sales.clear(), db.movements.clear()]);
    });
  }
  await db.products.bulkPut(data.products || []);
  await db.sales.bulkPut(data.sales || []);
  await db.movements.bulkPut(data.movements || []);
  if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings);
}

export async function wipeAll() {
  await db.transaction('rw', db.products, db.sales, db.movements, async () => {
    await Promise.all([db.products.clear(), db.sales.clear(), db.movements.clear()]);
  });
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
