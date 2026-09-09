import { getSetting } from './db.js';
import { isNightBaghdad } from './utils.js';

/* Theme modes: 'light' | 'dark' | 'auto' (auto = dark in Baghdad night, 6pm→6am) */
export const THEME_STORE = 'ghazala.theme';

let currentMode = 'light';
let clockOn = false;

export function effectiveTheme(mode) {
  if (mode === 'auto') return isNightBaghdad() ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode) {
  currentMode = mode;
  const eff = effectiveTheme(mode);
  const el = document.documentElement;
  if (eff === 'dark') el.setAttribute('data-theme', 'dark');
  else el.removeAttribute('data-theme');
  try { localStorage.setItem(THEME_STORE, mode); } catch { /* noop */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', eff === 'dark' ? '#171013' : '#FBF3EE');
  ensureClock();
  return eff;
}

export async function loadTheme() {
  applyTheme((await getSetting('theme', 'light')) || 'light');
}

/* while in auto mode, re-check the Baghdad clock every minute */
function ensureClock() {
  if (clockOn) return;
  clockOn = true;
  setInterval(() => { if (currentMode === 'auto') applyTheme('auto'); }, 60000);
}
