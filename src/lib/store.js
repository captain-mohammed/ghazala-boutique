import { writable } from 'svelte/store';

/* ---------- Toasts ---------- */
export const toasts = writable([]);
let toastId = 0;
export function toast(message, kind = 'default', duration = 2600) {
  const id = ++toastId;
  toasts.update((t) => [...t, { id, message, kind }]);
  setTimeout(() => toasts.update((t) => t.filter((x) => x.id !== id)), duration);
}
export const toastOk = (m) => toast(m, 'success');
export const toastErr = (m) => toast(m, 'error');

/* ---------- Celebration bursts ---------- */
export const celebrate = writable(null); // { x, y, ox, oy, emoji } | null
export function celebrateAt(x = window.innerWidth / 2, y = window.innerHeight / 2.6, emoji = '✨', origin = null) {
  celebrate.set({ x, y, ox: origin?.x ?? x, oy: origin?.y ?? y, emoji, key: Date.now() });
  setTimeout(() => celebrate.set(null), 1600);
}

/* ---------- Sale milestones (تبدأ من خمس قطع في اليوم) ----------
   Fire once per threshold per day as today's piece count climbs. */
export const MILESTONES = [5, 10, 20, 35, 50, 75, 100];
const MILESTONE_TEXT = {
  5: 'الخامسة! خمس قطع اليوم — عقبال المئة 💛',
  10: 'عشرة قطع اليوم — البوتيك ما يوقف 🔥',
  20: 'عشرون قطعة! يوم تاريخي للبوتيك 👑',
  35: '٣٥ قطعة اليوم — شطور يا بوتيك غزالة 🚀',
  50: 'خمسون قطعة! نصف مئة في يوم واحد 💎',
  75: '٧٥ قطعة — هذا مو يوم عادي 🌟',
  100: 'مئة قطعة في يوم واحد! أسطورة 🏆'
};
let msDay = null;
let msLevel = 0;
export function milestoneFor(pieces) {
  const key = new Date().toDateString();
  if (msDay !== key) { msDay = key; msLevel = 0; }
  let hit = null;
  for (let i = 0; i < MILESTONES.length; i++) {
    if (pieces >= MILESTONES[i] && msLevel < i + 1) {
      hit = { threshold: MILESTONES[i], text: MILESTONE_TEXT[MILESTONES[i]] };
      msLevel = i + 1;
    }
  }
  return hit;
}

/* ---------- Confirm dialog ---------- */
export const confirmState = writable(null); // { title, body, danger, okLabel, resolve }
export function askConfirm({ title = 'تأكيد', body = '', okLabel = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => {
    confirmState.set({ title, body, okLabel, danger, resolve });
  });
}
export function resolveConfirm(val) {
  confirmState.update((c) => { c?.resolve?.(val); return null; });
}

/* ---------- App logo (custom, data URL) ---------- */
export const logo = writable(null);

/* ---------- Cross-screen intents ---------- */
export const invoicePreset = writable(null); // { supplier, lines: [line…] } → فاتورة الوارد
export const sellPrefill = writable(null);   // search term → تبويب البيع

/* ---------- Shared catalog filters (المخزون ⇄ البيع) ----------
   One source of truth: whatever she filters in المخزون applies in البيع
   and vice-versa — the state survives tab switches too. The الحالة dropdown
   is the one exception: each tab keeps its own (المخزون ← الكل، البيع ← متوفر). */
export const catalogFilters = writable({
  q: '', cat: 'الكل', typ: 'الكل', season: 'الكل',
  availInv: 'all', availSell: 'in',
  sort: 'new'
});

/* the premium filter card starts collapsed in both tabs — expanded only
   when needed; the filter VALUES above are never touched by this */
export const filtersOpen = writable(false);

/* ---------- Misc ui ---------- */
export const uiFlags = writable({ sawReportsTip: false });
