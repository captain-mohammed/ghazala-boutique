<script>
  import { fade, fly } from 'svelte/transition';
  import { getSetting, setSetting, allSettings } from '../db.js';
  import { hashPin, buzz } from '../utils.js';
  import { toastErr, toastOk } from '../store.js';
  import { magnet, tilt } from '../motion.js';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  let { onunlock = () => {} } = $props();

  let mode = $state('loading'); // loading | set | set2 | unlock
  let pin = $state('');
  let firstPin = $state('');
  let error = $state(false);
  let cool = $state(0);
  let tries = 0;

  const hasPin = $state({ v: false });

  $effect(() => {
    (async () => {
      const s = await allSettings();
      hasPin.v = !!s.pin;
      mode = hasPin.v ? 'unlock' : 'set';
    })();
  });

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  function press(k) {
    if (cool > 0 || k === '') return;
    buzz(8);
    if (k === 'del') { pin = pin.slice(0, -1); return; }
    if (pin.length >= 6) return;
    pin += k;
    if (pin.length === 4) setTimeout(judge, 140);
  }

  async function judge() {
    const code = pin;
    if (mode === 'set') {
      firstPin = code;
      mode = 'set2';
      pin = '';
    } else if (mode === 'set2') {
      if (code !== firstPin) {
        fail('الرقمان غير متطابقين — حاول مجدداً');
        mode = 'set';
        pin = '';
        return;
      }
      await setSetting('pin', await hashPin(code));
      toastOk('تم تعيين الرقم السري');
      buzz([30, 60, 30]);
      onunlock();
    } else if (mode === 'unlock') {
      const ok = (await hashPin(code)) === (await getSetting('pin', null));
      if (ok) {
        buzz([30, 60, 30]);
        toastOk('مرحباً بعودتك 👋');
        onunlock();
      } else {
        fail('رقم سري خاطئ');
        tries++;
        if (tries % 3 === 0) {
          cool = 30;
          const t = setInterval(() => {
            cool--;
            if (cool <= 0) clearInterval(t);
          }, 1000);
        }
        pin = '';
      }
    }
  }

  function fail(msg) {
    error = true;
    toastErr(msg);
    setTimeout(() => (error = false), 500);
  }
</script>

<div class="lock" class:shake={error}>
  <div class="lock-inner" in:fade={{ duration: 300 }}>
    <div class="floaty" use:tilt={{ max: 14, scale: 1.06 }}><Logo size={86} /></div>
    <div class="wordmark shimmer-text">GHAZALA BOUTIQUE</div>
    <div class="divider-gold" style="width:150px"></div>
    <div class="tag">أناقة تمشي بخطى واثقة</div>

    {#if mode === 'set' || mode === 'set2'}
      <p class="prompt">{mode === 'set' ? 'اختاري رقماً سرياً (4 أرقام)' : 'أعيدي إدخال الرقم للتأكيد'}</p>
    {:else if mode === 'unlock'}
      <p class="prompt">أدخلي الرقم السري</p>
    {:else}
      <p class="prompt">…</p>
    {/if}

    <div class="dots" class:err={error}>
      {#each Array(4) as _, i}
        <span class="dot" class:fill={i < pin.length} style={i < pin.length ? 'animation: dot-in .32s cubic-bezier(.34,1.56,.64,1) both' : ''}></span>
      {/each}
    </div>

    {#if cool > 0}
      <p class="muted small">انتظر {cool} ثانية…</p>
    {:else}
      <div class="pad">
        {#each KEYS as k, i (i)}
          {#if k === 'del'}
            <button class="key" use:magnet={{ strength: 0.22, max: 6 }} in:fly={{ y: 22, duration: 380, delay: 220 + i * 45 }} aria-label="حذف" onclick={() => press('del')}>
              <Icon name="back" size={22} style="transform:scaleX(-1)" />
            </button>
          {:else if k === ''}
            <div></div>
          {:else}
            <button class="key ripple" use:magnet={{ strength: 0.22, max: 6 }} in:fly={{ y: 22, duration: 380, delay: 220 + i * 45 }} onclick={() => press(k)}>{k}</button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ivory);
    overflow: hidden;
  }
  .lock::before {
    content: '';
    position: absolute;
    width: 90vmax; height: 90vmax;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(181, 73, 91, 0.14), transparent 60%);
    top: -30%; right: -25%;
    pointer-events: none; /* decorative only — must never swallow taps */
  }
  .lock::after {
    content: '';
    position: absolute;
    width: 80vmax; height: 80vmax;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(201, 161, 90, 0.16), transparent 60%);
    bottom: -25%; left: -20%;
    pointer-events: none;
  }
  .lock-inner {
    position: relative;
    z-index: 1; /* keep every key above the decorative blobs */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px;
    width: 100%;
    max-width: 340px;
  }
  .wordmark { font-size: 15px; font-weight: 800; letter-spacing: 4px; }
  .tag { font-size: 12.5px; color: var(--ink-2); }
  .prompt { margin: 12px 0 2px; color: var(--ink-2); font-size: 14px; font-weight: 600; }
  .dots { display: flex; gap: 14px; margin: 8px 0 18px; }
  .dot {
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 2px solid var(--taupe);
    transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .dot.fill {
    background: var(--burgundy);
    border-color: var(--burgundy);
    transform: scale(1.15);
    box-shadow: 0 3px 10px rgba(181, 73, 91, 0.4);
  }
  .dots.err .dot { border-color: var(--burgundy-deep); }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 14px;
    direction: ltr; /* digits are English — keypad flows 1-2-3 / 4-5-6 like a phone dialer */
  }
  .key {
    width: 72px; height: 72px;
    border-radius: 50%;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    font-size: 24px;
    font-weight: 700;
    color: var(--ink);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
    box-shadow: 0 4px 14px rgba(122, 46, 58, 0.08);
  }
  .key:active { transform: scale(0.88); background: var(--accent-soft); }
</style>
