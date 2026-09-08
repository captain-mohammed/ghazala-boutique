/* Formatting — digits always 1234 style, currency always د.ع */

const nf = new Intl.NumberFormat('en-US');

export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));
export const fmtIQD = (n) => fmtNum(n) + ' د.ع';

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

/* ---------- WhatsApp delivery message ---------- */

export function buildSalesMessage(sale) {
  const lines = [];
  lines.push(`مرحباً ${sale.customerName || 'زبوننا العزيز'} 🌸`);
  lines.push('');
  lines.push(`طلبك رقم #${sale.id} من بوتيك غزالة جاهز ✨`);
  lines.push('');
  lines.push('🛍️ تفاصيل الطلب:');
  for (const it of sale.items || []) {
    lines.push(`• ${it.name} × ${fmtNum(it.qty)} — ${fmtIQD(it.price * it.qty)}`);
  }
  lines.push('');
  lines.push(`المجموع: ${fmtIQD(sale.subtotal)}`);
  if (sale.deliveryFee) lines.push(`التوصيل: ${fmtIQD(sale.deliveryFee)}`);
  lines.push(`الإجمالي: ${fmtIQD(sale.total)}`);
  if (sale.barcode) {
    lines.push('');
    lines.push(`📦 باركود الشحنة: ${sale.barcode}`);
  }
  lines.push('');
  lines.push('شكراً لثقتك بغزالة 🦌');
  return lines.join('\n');
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
