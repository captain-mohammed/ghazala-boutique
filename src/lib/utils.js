/* Formatting — digits always 1234 style, currency always د.ع */

const nf = new Intl.NumberFormat('en-US');

export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));
export const fmtIQD = (n) => fmtNum(n) + ' د.ع';

/* Pieces in a sale = sum of item quantities (items.length is only the
   number of distinct lines — 2× the same shoe is one line with qty 2) */
export const salePieces = (s) => (s?.items || []).reduce((a, it) => a + (Number(it.qty) || 0), 0);

/* ---------- Baghdad time (UTC+3) ----------
   Every clock face and "today" boundary in the app follows Baghdad
   wall-clock time, not the device's timezone. 12-hour display with ص/م. */

const BAGHDAD_TZ = 'Asia/Baghdad';
const bagFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BAGHDAD_TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

function baghdadWall(d) {
  const o = {};
  for (const p of bagFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = p.value;
  return o;
}

/* Baghdad's UTC offset at a given instant (ms) — ICU tzdata-driven,
   so if Iraq ever reinstates DST this still stays correct */
function baghdadOffsetMs(d = new Date()) {
  const p = baghdadWall(d);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - d.getTime();
}

export function fmtDate(iso) {
  if (!iso) return '—';
  const p = baghdadWall(new Date(iso));
  const h24 = +p.hour % 24;
  const period = h24 < 12 ? 'ص' : 'م';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const date = `${+p.day} ${MONTHS_AR[+p.month - 1]} ${p.year}`;
  return `${date} • ${h12}:${p.minute} ${period}`;
}

const MONTHS_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

/* "Today" starts at Baghdad midnight — a real instant computed from
   the current Baghdad offset (DST-proof). Used by dashboard, reports. */
export const startOfToday = () => {
  const now = new Date();
  const off = baghdadOffsetMs(now);
  const wall = new Date(now.getTime() + off);
  wall.setUTCHours(0, 0, 0, 0);
  return new Date(wall.getTime() - off);
};
export const daysAgoStart = (n) => new Date(startOfToday().getTime() - n * 86400000);
export const isSameDay = (iso, ref = new Date()) => {
  const off = baghdadOffsetMs();
  const a = new Date((iso instanceof Date ? iso : new Date(iso)).getTime() + off);
  const b = new Date((ref instanceof Date ? ref : new Date(ref)).getTime() + off);
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
};

export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Haptics */
export const buzz = (ms = 10) => { try { navigator.vibrate?.(ms); } catch { /* noop */ } };

/* Read an image file and downscale it to a compact PNG data URL (for the custom logo) */
export function fileToLogoDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) return reject(new Error('not an image'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(reader.result); // fallback: original data URL
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Product photo — same pipeline but JPEG (much smaller than PNG for photos) */
export function fileToPhotoDataUrl(file, max = 640, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) return reject(new Error('not an image'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(reader.result);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* PIN hashing — non-reversible salted digest (SHA-256) */
export async function hashPin(pin, salt = 'ghazala') {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Simple async dead-stock helper: last sale date per sku */
export function lastSaleMap(sales) {
  const map = new Map();
  for (const s of sales) {
    for (const it of s.items || []) {
      const prev = map.get(it.sku);
      if (!prev || new Date(s.date) > new Date(prev)) map.set(it.sku, s.date);
    }
  }
  return map;
}

/* ---------- WhatsApp delivery message ----------
   The template is stored as a setting ("waTemplate") and editable in
   الإعدادات ← رسالة الواتساب. Variables: {customer} {order} {items}
   {subtotal} {delivery} {total} {shop}. The shipment barcode stays in-app
   on purpose — the customer never sees the parcel number in the message. */

export const WA_VARS = [
  { token: '{customer}', label: 'اسم الزبون' },
  { token: '{order}', label: 'رقم الطلب' },
  { token: '{items}', label: 'تفاصيل القطع' },
  { token: '{subtotal}', label: 'المجموع' },
  { token: '{delivery}', label: 'أجور التوصيل' },
  { token: '{total}', label: 'الإجمالي' },
  { token: '{province}', label: 'المحافظة' },
  { token: '{address}', label: 'العنوان الكامل' },
  { token: '{shop}', label: 'اسم البوتيك' }
];

export const DEFAULT_WA_TEMPLATE =
  'مرحباً {customer} 🌸\n\n' +
  'طلبك رقم {order} من {shop} جاهز ✨\n\n' +
  '🛍️ تفاصيل الطلب:\n{items}\n\n' +
  'المجموع: {subtotal}\n' +
  'التوصيل: {delivery}\n' +
  'الإجمالي: {total}\n\n' +
  'شكراً لثقتك بغزالة 🦌';

export function buildSalesMessage(sale, template = DEFAULT_WA_TEMPLATE) {
  const itemLines = (sale.items || [])
    .map((it) => `• ${it.name} × ${fmtNum(it.qty)} — ${fmtIQD(it.price * it.qty)}`)
    .join('\n');
  const map = {
    '{customer}': sale.customerName || 'زبوننا العزيز',
    '{order}': `#${sale.id}`,
    '{items}': itemLines,
    '{subtotal}': fmtIQD(sale.subtotal),
    '{delivery}': fmtIQD(sale.deliveryFee || 0),
    '{total}': fmtIQD(sale.total),
    '{province}': sale.province || '—',
    '{address}': sale.address || '—',
    '{shop}': 'بوتيك غزالة'
  };
  let out = String(template || DEFAULT_WA_TEMPLATE);
  for (const [k, v] of Object.entries(map)) out = out.split(k).join(v);
  return out;
}

/* Normalize an Iraqi phone number for wa.me: keep digits only, and
   07XXXXXXXXX (11 digits) becomes the Iraq country code 964 + the 10-digit
   local number (7XXXXXXXX). Returns null when there's no usable number. */
export function waPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00964')) d = d.slice(5);
  else if (d.startsWith('964')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10 && d.startsWith('7')) return '964' + d;
  return null;
}

/* Open WhatsApp with the message prefilled (and the chat addressed to the
   customer when we have a valid number). NOTE: no 'noopener' feature — the
   spec makes window.open return null with it, which would break success
   detection. The opener reference is severed manually instead. Falls back
   to copying the text when the popup is blocked (e.g. desktop WebView). */
export async function sendWhatsApp(message, phone, fallbackCopy = true) {
  const text = encodeURIComponent(message);
  const num = waPhone(phone);
  const url = num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
  let w = null;
  try {
    w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch { /* cross-origin: fine */ } }
  } catch { w = null; }
  if (w) return { opened: true, copied: false };
  if (fallbackCopy) return { opened: false, copied: await copyText(message) };
  return { opened: false, copied: false };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------- Paste-to-sell: parse a customer's WhatsApp order text ---------- */

/* Extracts size candidates (2-digit 30-45) and search keywords from free
   Arabic text. Returns { sizes: [], keywords: [] }. */
export function parseOrderText(text) {
  const t = String(text || '');
  const out = { sizes: [], keywords: [] };

  // sizes: standalone 2-digit numbers 30–45 (avoid phone fragments by
  // requiring non-digit boundaries)
  const sizeMatches = t.match(/(?<!\d)(3[0-9]|4[0-5])(?!\d)/g) || [];
  out.sizes = [...new Set(sizeMatches)];

  // keywords: meaningful words (drop stopwords, numbers, punctuation)
  const STOP = new Set(['من', 'على', 'في', 'عن', 'الى', 'إلى', 'مع', 'هذا', 'هذه', 'اردت', 'أريد', 'ابي', 'أبي', 'المطلوب', 'ممكن', 'لو', 'سماح', 'بس', 'اكو', 'ماكو', 'شكرا', 'هاي', 'الا', 'اللي']);
  const words = t
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  out.keywords = [...new Set(words)];

  return out;
}
