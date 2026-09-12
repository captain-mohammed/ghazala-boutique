<script>
  /* منتقي الألوان — درجة دقيقة بالإبهام: صبغة بشريط قوس قزح،
     ثم شبكة درجات (فاتح ← غامق × مشبع ← هادئ). اللمسة تثبت وتغلق. */
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let { open = false, hex = '#b5495b', onpick = () => {}, onclose = () => {} } = $props();

  function hexToHsl(h) {
    const n = parseInt(String(h).replace('#', ''), 16);
    if (!Number.isFinite(n)) return [0, 0, 50];
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let hdeg = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) hdeg = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) hdeg = ((b - r) / d + 2) * 60;
      else hdeg = ((r - g) / d + 4) * 60;
    }
    return [hdeg, s * 100, l * 100];
  }
  function hslToHex(hdeg, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + hdeg / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to255 = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
    return '#' + to255(f(0)) + to255(f(8)) + to255(f(4));
  }

  let hue = $state(0);
  const LIGHTS = [95, 86, 74, 60, 46, 33, 20];
  const SATS = [90, 62, 36, 14];

  /* عند كل فتح: الصبغة تبدأ من لون الدائرة الحالي */
  $effect(() => {
    if (open) {
      const [h] = hexToHsl(hex);
      hue = Math.round(h);
    }
  });

  const rows = $derived(LIGHTS.map((l) => SATS.map((s) => hslToHex(hue, s, l))));
</script>

<Sheet open={open} title="درجة اللون" onclose={onclose}>
  <div class="stack" style="gap:14px">
    <div class="cp-preview">
      <span class="cp-dot" style="background:{hex}"></span>
      <div class="cp-meta">
        <span class="bold small">الدرجة الحالية</span>
        <span class="muted tiny" dir="ltr">{hex}</span>
      </div>
    </div>

    <div class="field">
      <label class="cp-lab">الصبغة — اسحبي الشريط</label>
      <input class="cp-hue" type="range" min="0" max="360" step="1" bind:value={hue} oninput={() => buzz(4)} />
    </div>

    <div class="field">
      <label class="cp-lab">الدرجة — لمسة تثبت</label>
      <div class="cp-grid">
        {#each rows as row, ri (ri)}
          {#each row as h, ci (ri + '-' + ci)}
            <button type="button" class="cp-cell" class:on={h.toLowerCase() === String(hex).toLowerCase()} style="background:{h}" onclick={() => { buzz(8); onpick(h); onclose(); }} aria-label="درجة {h}"></button>
          {/each}
        {/each}
      </div>
    </div>

    <p class="muted tiny" style="margin:0">شبكة الدرجات تُبنى من الصبغة المختارة: الأعلى فاتح والأسفل غامق، واليمين أكثر نقاء.</p>
  </div>
</Sheet>

<style>
  .cp-preview { display: flex; align-items: center; gap: 12px; }
  .cp-dot {
    width: 52px; height: 52px; border-radius: 50%; flex: none;
    border: 2.5px solid rgba(201, 161, 90, 0.65);
    box-shadow: 0 4px 14px rgba(58, 26, 32, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }
  .cp-meta { display: flex; flex-direction: column; gap: 2px; }
  .cp-lab { font-size: 11.5px; font-weight: 800; color: var(--taupe); display: block; margin-bottom: 7px; }
  /* شريط الصبغة: قوس قزح كامل بإبهام كبير */
  .cp-hue {
    direction: ltr;
    width: 100%;
    height: 34px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 999px;
    background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    outline: none;
    cursor: pointer;
  }
  .cp-hue::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.92);
    border: 3px solid #fff;
    box-shadow: 0 2px 10px rgba(58, 26, 32, 0.45);
    cursor: grab;
  }
  .cp-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .cp-cell {
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    border: 2.5px solid rgba(255, 255, 255, 0.65);
    box-shadow: 0 1px 5px rgba(58, 26, 32, 0.16);
    cursor: pointer;
    padding: 0;
    transition: transform 0.13s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .cp-cell:active { transform: scale(0.88); }
  .cp-cell.on { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201, 161, 90, 0.35); }
</style>
