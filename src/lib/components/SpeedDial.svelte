<script>
  import { fade, fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let { actions = [], onselect = () => {}, label = 'إجراءات', lift = false } = $props();

  let open = $state(false);

  /* Portal: the FAB lives directly on <body> — a transform/filter on the
     screen wrapper (slide-in) must NEVER turn it into the FAB's containing
     block. The FAB is pinned to the viewport, centered to the dock. */
  let host = $state(null);
  $effect(() => {
    if (host && host.parentNode !== document.body) document.body.appendChild(host);
  });

  function toggle() {
    open = !open;
    buzz(open ? [12, 26, 12] : 8);
  }

  function pick(a) {
    buzz(10);
    open = false;
    onselect(a);
  }
</script>

<div class="sd-portal" bind:this={host}>
  {#if open}
    <div class="sd-backdrop" transition:fade={{ duration: 180 }} onclick={() => { open = false; buzz(6); }} aria-hidden="true"></div>
  {/if}

  <div class="sd-root" class:lift>
    {#if open}
      <div class="sd-items">
        {#each actions as a, i (a.id)}
          <button
            class="sd-item glass-strong"
            in:fly={{ y: 18, duration: 340, delay: 60 + i * 55, easing: backOut }}
            out:fade={{ duration: 110 }}
            onclick={() => pick(a)}
            aria-label={a.label}
          >
            <span class="sd-ic"><Icon name={a.icon} size={19} color="#fff" /></span>
            <span class="sd-txt">{a.label}</span>
          </button>
        {/each}
      </div>
    {/if}

    <button class="sd-fab" class:open aria-expanded={open} aria-label={label} onclick={toggle}>
      <span class="sd-plus"><Icon name="plus" size={25} color="#fff" /></span>
    </button>
  </div>
</div>

<style>
  .sd-portal { display: contents; }
  /* Frosted-glass veil — same blur language as the app's glass, no dark dim */
  .sd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: rgba(251, 243, 238, 0.38);
    backdrop-filter: blur(16px) saturate(1.3);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
  }
  .sd-root {
    position: fixed;
    bottom: calc(var(--nav-h) + 40px + var(--sab));
    /* mirror the dock's geometry exactly → FAB centers to the dock, not the page */
    left: 12px;
    right: 12px;
    max-width: 536px;
    margin: 0 auto;
    z-index: 46;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    pointer-events: none; /* empty box areas never swallow taps */
    transition: bottom 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* rides above the floating cart bar when one is on screen (بيع) */
  .sd-root.lift { bottom: calc(var(--nav-h) + 98px + var(--sab)); }
  .sd-items { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .sd-item {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px;
    padding-inline-end: 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.65);
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 8px 22px rgba(58, 26, 32, 0.16);
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sd-item:active { transform: scale(0.95); }
  .sd-ic {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    box-shadow: inset 0 2px 6px rgba(255, 255, 255, 0.25);
  }
  .sd-txt {
    font-size: 13.5px;
    font-weight: 800;
    color: var(--ink);
    white-space: nowrap;
  }
  .sd-fab {
    pointer-events: auto;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 8px 22px rgba(122, 46, 58, 0.32);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
  }
  .sd-fab:active { transform: scale(0.92); }
  .sd-fab.open { transform: rotate(45deg); box-shadow: 0 4px 14px rgba(122, 46, 58, 0.24); }
  .sd-plus { display: flex; transition: transform 0.2s; }
</style>
