<script>
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let { tabs = [], active = 'home', onselect = () => {} } = $props();

  const BUB = 64;
  let barEl = $state(null);
  let ind = $state({ x: 0, ready: false });

  $effect(() => {
    const el = barEl;
    const btn = el?.querySelector(`[data-tab="${active}"]`);
    if (!el || !btn) return;
    const barRect = el.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    ind = { x: r.left + r.width / 2 - barRect.left - BUB / 2, ready: true };
  });
</script>

<div class="dock">
  <nav
    class="glass-strong nav"
    class:ready={ind.ready}
    bind:this={barEl}
    style="--cx: {ind.x + BUB / 2}px"
    aria-label="التنقل الرئيسي"
  >
    {#each tabs as t (t.id)}
      <button
        class="tab"
        class:on={active === t.id}
        data-tab={t.id}
        aria-label={t.label}
        onclick={() => { buzz(9); onselect(t.id); }}
      >
        <span class="ic"><Icon name={t.icon} size={22} stroke={active === t.id ? 2 : 1.8} /></span>
        <span class="lbl">{t.label}</span>
      </button>
    {/each}
  </nav>

  <!-- raised bubble (sibling so the bar's mask never clips it) -->
  <div class="bubble" class:ready={ind.ready} style="left: {ind.x}px">
    <span class="glow"></span>
    {#key active}
      <span class="bub-ic pop">
        <Icon name={tabs.find((t) => t.id === active)?.icon || 'home'} size={24} stroke={2.1} />
      </span>
    {/key}
  </div>
</div>

<style>
  @property --cx {
    syntax: '<length>';
    inherits: false;
    initial-value: 0px;
  }

  .dock {
    position: fixed;
    bottom: calc(12px + var(--sab));
    left: 12px;
    right: 12px;
    max-width: 536px;
    margin: 0 auto;
    height: 94px; /* bar 68 + 26px protrusion */
    z-index: 50;
    pointer-events: none;
  }
  .nav {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 68px;
    display: flex;
    align-items: stretch;
    justify-content: space-around;
    border-radius: 26px;
    pointer-events: auto;
    transition: --cx 0.42s cubic-bezier(0.34, 1.3, 0.5, 1);
  }
  /* gooey melt: holes cut into the bar around the bubble (aurora shows through) */
  .nav.ready {
    -webkit-mask-image:
      radial-gradient(circle 42px at var(--cx) 6px, transparent 36px, #000 39px),
      radial-gradient(circle 15px at calc(var(--cx) - 47px) 11px, transparent 10px, #000 12.5px),
      radial-gradient(circle 15px at calc(var(--cx) + 47px) 11px, transparent 10px, #000 12.5px);
    mask-image:
      radial-gradient(circle 42px at var(--cx) 6px, transparent 36px, #000 39px),
      radial-gradient(circle 15px at calc(var(--cx) - 47px) 11px, transparent 10px, #000 12.5px),
      radial-gradient(circle 15px at calc(var(--cx) + 47px) 11px, transparent 10px, #000 12.5px);
  }

  .bubble {
    position: absolute;
    top: 0;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.94), rgba(251, 243, 238, 0.8));
    border: 1.5px solid rgba(201, 161, 90, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 14px 30px rgba(122, 46, 58, 0.22), inset 0 2px 10px rgba(255, 255, 255, 0.75);
    transition: left 0.42s cubic-bezier(0.34, 1.3, 0.5, 1), opacity 0.25s;
    opacity: 0;
    pointer-events: none;
  }
  .bubble.ready { opacity: 1; }
  .glow {
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(181, 73, 91, 0.16), transparent 65%);
  }
  .bub-ic {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 6px 16px rgba(181, 73, 91, 0.4), inset 0 2px 8px rgba(255, 255, 255, 0.28);
  }
  .pop { animation: pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1); }

  .tab {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    background: none;
    border: none;
    color: var(--ink-2);
    cursor: pointer;
    padding: 8px 2px 7px;
  }
  .ic { display: flex; transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s; }
  .tab.on { color: var(--burgundy); }
  .tab.on .ic { transform: scale(0.2); opacity: 0; }
  .lbl {
    font-size: 10.5px;
    font-weight: 700;
    height: 15px;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.28s, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .tab.on .lbl { opacity: 1; transform: translateY(0); }
</style>
