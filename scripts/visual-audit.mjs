/* تدقيق بصري حقيقي: متصفح فعلي + بيانات صاحبة البوتيك + لقطات لكل شاشة.
   لا يحكم على التصميم بدل العين — يعطي العين صوراً بدل التخمين. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const DIST = path.resolve('dist');
const BACKUP = 'D:/ABDM/Telegram/ghazala-backup-2026-10-03.json';
const OUT = path.resolve('audit-shots');
const PORT = 4789;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/seed.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    fs.createReadStream(BACKUP).pipe(res);
    return;
  }
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('   [console]', m.text().slice(0, 160)); });
page.on('pageerror', (e) => console.log('   [pageerror]', String(e).slice(0, 200)));

console.log('→ opening app');
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);

console.log('→ seeding real backup into IndexedDB');
const seeded = await page.evaluate(async () => {
  const data = await (await fetch('/seed.json')).json();
  const idb = await new Promise((res, rej) => {
    const r = indexedDB.open('ghazala_boutique');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const stores = [...idb.objectStoreNames];
  const tx1 = (fn) => new Promise((res) => { const t = fn(); t.oncomplete = res; t.onerror = res; t.onabort = res; });
  for (const n of stores) await tx1(() => { const t = idb.transaction(n, 'readwrite'); t.objectStore(n).clear(); return t; });
  let wrote = 0;
  for (const n of stores) {
    const rows = data[n];
    if (!Array.isArray(rows) || !rows.length) continue;
    await tx1(() => {
      const t = idb.transaction(n, 'readwrite');
      const st = t.objectStore(n);
      for (const row of rows) { try { st.put(row); wrote++; } catch { /* skip bad row */ } }
      return t;
    });
  }
  await tx1(() => { const t = idb.transaction('settings', 'readwrite'); t.objectStore('settings').delete('pin'); return t; });
  idb.close();
  return { stores: stores.length, wrote };
});
console.log('   seeded rows:', seeded.wrote, 'stores:', seeded.stores);

console.log('→ reload (boot migrations run)');
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3500);

if (await page.$('.lock')) {
  console.log('→ unlocking with 1234');
  await page.keyboard.type('1234', { delay: 60 });
  await sleep(500);
  await page.keyboard.type('1234', { delay: 60 });
  await sleep(2200);
}

const shot = async (name, { bottom = false } = {}) => {
  if (bottom) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  else await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('   📸', name);
};
const dismiss = async () => {
  /* حارس الخروج يسأل «خروج بلا حفظ؟» — الإغلاق بالخلفية = إلغاء = نبقى
     عالقين في الشاشة. نضغط زر التأكيد نفسه (غير «إلغاء»). */
  const had = await page.evaluate(() => {
    const card = document.querySelector('.backdrop .card');
    if (!card) return false;
    const btns = [...card.querySelectorAll('button')];
    const ok = btns.find((b) => !b.textContent.includes('إلغاء')) || btns[0];
    if (ok) { ok.click(); return true; }
    return false;
  });
  if (had) await sleep(700);
  return had;
};
const tab = async (label) => {
  await page.evaluate((l) => {
    const t = [...document.querySelectorAll('.dock .tab')].find((e) => e.textContent.trim().includes(l));
    t?.click();
  }, label);
  await sleep(900);
  await dismiss();
  await sleep(500);
};
const clickText = async (label) => {
  const ok = await page.evaluate((l) => {
    const els = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = els.find((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(l));
    if (hit) { hit.click(); return true; }
    return false;
  }, label);
  await sleep(1100);
  return ok;
};

await shot('00-lock-or-home');

for (const [label, name] of [['الرئيسية', '01-dashboard'], ['المخزون', '02-inventory'], ['بيع', '03-sell'], ['تقارير', '04-reports'], ['السجل', '05-saleslog'], ['المزيد', '06-more']]) {
  await tab(label);
  await shot(name);
}

/* أسفل القائمة: هل آخر بطاقة/صف مقروءة فوق الشريط العائم والزر؟ */
await tab('المخزون');
await shot('02b-inventory-bottom', { bottom: true });
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(400);
/* بطاقة الموديل: صف واحد لكل لون */
await page.evaluate(() => {
  const card = [...document.querySelectorAll('button')].find((e) => e.querySelector('img'));
  card?.click();
});
await sleep(1300);
await shot('02c-itemdetail');
await page.evaluate(() => document.querySelector('.backdrop')?.click());
await sleep(700);
await tab('بيع');
await shot('03b-sell-bottom', { bottom: true });

/* شاشات «المزيد» */
const subs = [
  ['متجري', '07-store'], ['فاتورة وارد', '08-receive'], ['بيع من رسالة', '09-pastesell'],
  ['استوديو التسويق', '10-broadcast'], ['استوديو القصص', '11-studio'],
  ['دفتر الزبونات', '12-customers'], ['الحجوزات', '13-reservations'], ['المناسبات', '14-occasions'],
  ['دفتر الموردين', '15-suppliers'], ['حساب الشركات', '16-ledger'], ['المصاريف', '17-expenses'],
  ['خيارات الموديلات', '18-modelopts'], ['إصلاح الموديلات', '19-repair'],
  ['الإعدادات', '20-settings'], ['النسخ الاحتياطي', '21-backup'],
  ['سلة المحذوفات', '22-trash'], ['سلة الصور', '23-phototrash'], ['عن التطبيق', '24-about']
];
for (const [label, name] of subs) {
  await tab('المزيد');
  const ok = await clickText(label);
  if (!ok) { console.log('   ⚠ not found:', label); continue; }
  await shot(name);
}

console.log('done →', OUT);
await browser.close();
server.close();
