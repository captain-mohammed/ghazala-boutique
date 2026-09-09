<script>
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let {
    title = 'لا توجد بيانات',
    subtitle = 'يبدو أنك لم تضف شيئاً بعد.',
    actionLabel = null,
    onaction = () => {},
    icon = 'box'
  } = $props();
</script>

<section class="glass premium rise">
  <span class="glow g1" aria-hidden="true"></span>
  <span class="glow g2" aria-hidden="true"></span>

  <div class="illus" aria-hidden="true">
    <span class="dust du1"></span>
    <span class="dust du2"></span>
    <span class="dust du3"></span>
    <div class="face">
      <span class="eye e-l"></span>
      <span class="eye e-r"></span>
      <span class="tear"></span>
    </div>
    <div class="mag">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-3.8-3.8" />
      </svg>
    </div>
    <span class="ring"></span>
  </div>

  <h2 class="h2">{title}</h2>
  <p class="muted center sub">{subtitle}</p>

  {#if actionLabel}
    <button class="btn primary act" onclick={() => { buzz(10); onaction(); }}>
      <Icon name="plus" size={18} /> {actionLabel}
    </button>
  {/if}
</section>

<style>
  .premium {
    position: relative;
    overflow: hidden;
    padding: 34px 24px 28px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
  }
  .glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(46px);
    pointer-events: none;
  }
  .g1 {
    width: 200px; height: 200px;
    top: -70px; inset-inline-start: -50px;
    background: rgba(181, 73, 91, 0.16);
  }
  .g2 {
    width: 180px; height: 180px;
    bottom: -70px; inset-inline-end: -40px;
    background: rgba(201, 161, 90, 0.2);
  }

  /* ---- Illustration: searching face + magnifier ---- */
  .illus {
    position: relative;
    width: 130px;
    height: 108px;
    margin-bottom: 8px;
  }
  .face {
    position: absolute;
    inset-inline-start: 12px;
    top: 8px;
    width: 78px;
    height: 78px;
    border-radius: 50%;
    border: 5px solid rgba(156, 123, 107, 0.55);
    animation: faceBob 4.5s ease-in-out infinite;
  }
  .eye {
    position: absolute;
    top: 26px;
    width: 8px;
    height: 12px;
    border-radius: 999px;
    background: rgba(122, 46, 58, 0.55);
  }
  .e-l { inset-inline-start: 18px; }
  .e-r { inset-inline-end: 18px; }
  .tear {
    position: absolute;
    top: 46px;
    inset-inline-end: 14px;
    width: 9px;
    height: 9px;
    border-radius: 50% 50% 50% 0;
    background: rgba(181, 73, 91, 0.5);
    animation: tearDrop 3.2s ease-in infinite;
  }
  .mag {
    position: absolute;
    inset-inline-end: 0;
    bottom: 0;
    width: 54px;
    height: 54px;
    color: var(--gold);
    transform: rotate(-18deg);
    animation: magScan 4.5s ease-in-out infinite;
  }
  .mag svg { width: 100%; height: 100%; }
  .mag::after {
    content: '';
    position: absolute;
    inset-inline-end: 5px;
    bottom: 3px;
    width: 12px;
    height: 12px;
    border-radius: 4px;
    background: var(--gold);
    transform: rotate(45deg);
  }
  .ring {
    position: absolute;
    inset-inline-start: 2px;
    top: -4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2.5px solid rgba(201, 161, 90, 0.65);
    animation: ringPulse 3.4s ease-out infinite;
  }
  .dust {
    position: absolute;
    border-radius: 50%;
    background: rgba(156, 123, 107, 0.4);
    animation: dustFloat 5s ease-in-out infinite;
  }
  .du1 { width: 7px; height: 7px; top: 2px; inset-inline-end: 26px; }
  .du2 { width: 5px; height: 5px; bottom: 14px; inset-inline-start: 30px; animation-delay: -1.6s; }
  .du3 { width: 4px; height: 4px; top: 40px; inset-inline-end: 2px; animation-delay: -3s; }

  @keyframes faceBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  @keyframes magScan {
    0%, 100% { transform: rotate(-18deg) translate(0, 0); }
    50% { transform: rotate(-6deg) translate(-8px, -4px); }
  }
  @keyframes tearDrop {
    0% { opacity: 0; transform: translateY(0) scale(0.6); }
    18% { opacity: 1; }
    62% { opacity: 1; transform: translateY(14px) scale(1); }
    100% { opacity: 0; transform: translateY(20px) scale(0.4); }
  }
  @keyframes ringPulse {
    0% { opacity: 0; transform: scale(0.6); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: scale(1.7); }
  }
  @keyframes dustFloat {
    0%, 100% { transform: translateY(0); opacity: 0.5; }
    50% { transform: translateY(-9px); opacity: 1; }
  }

  .sub { max-width: 240px; margin: 0; }
  .act { margin-top: 12px; min-width: 180px; }

  @media (prefers-reduced-motion: reduce) {
    .face, .mag, .tear, .ring, .dust { animation: none; }
  }
</style>
