/* Formatting — digits always 1234 style, currency always د.ع */

const nf = new Intl.NumberFormat('en-US');

export const fmtNum = (n) => nf.format(Math.round(Number(n) || 0));
export const fmtIQD = (n) => fmtNum(n) + ' د.ع';

export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} • ${time}`;
}

const MONTHS_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const daysAgoStart = (n) => { const d = startOfToday(); d.setDate(d.getDate() - n); return d; };
export const isSameDay = (iso, ref = new Date()) => {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
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
