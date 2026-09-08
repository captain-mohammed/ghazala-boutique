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
export const celebrate = writable(null); // { x, y, emoji } | null
export function celebrateAt(x = window.innerWidth / 2, y = window.innerHeight / 2.6, emoji = '✨') {
  celebrate.set({ x, y, emoji, key: Date.now() });
  setTimeout(() => celebrate.set(null), 1600);
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

/* ---------- Misc ui ---------- */
export const uiFlags = writable({ sawReportsTip: false });
