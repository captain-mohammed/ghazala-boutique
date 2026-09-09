<script>
  import { fade, fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let { actions = [], onselect = () => {} } = $props();

  let open = $state(false);

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

{#if open}
  <div class="sd-backdrop" transition:fade={{ duration: 180 }} onclick={() => { open = false; buzz(6); }} aria-hidden="true"></div>
{/if}

<div class="sd-root">
  {#if open}
    <div class="sd-items">
      {#each actions as a, i (a.id)}
        <div class="sd-item" in:fly={{ y: 20, duration: 340, delay: 60 + i * 55, easing: backOut }} out:fade={{ duration: 110 }}>
          <span class="sd-label glass-strong">{a.label}</span>
          <button
            class="sd-btn"
            style={a.bg ? `background:${a.bg}` : ''}
            aria-label={a.label}
            onclick={() => pick(a)}
          >
            <Icon name={a.icon} size={21} color="#fff" />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <button class="sd-fab" class:open aria-expanded={open} aria-label="إجراءات المخزون" onclick={toggle}>
    <span class="sd-plus"><Icon name="plus" size={25} color="#fff" /></span>
  </button>
</div>

<style>
  .sd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: rgba(30, 12, 15, 0.24);
  }
  .sd-root {
    position: fixed;
    bottom: calc(var(--nav-h) + 18px + var(--sab));
    right: 16px; /* physical right — above the dock's corner, RTL-independent */
    z-index: 46;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }
  .sd-items { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
  .sd-item { display: flex; align-items: center; gap: 10px; }
  .sd-label {
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    color: var(--ink);
    white-space: nowrap;
    box-shadow: 0 6px 18px rgba(58, 26, 32, 0.14);
  }
  .sd-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 5px 16px rgba(122, 46, 58, 0.28);
    transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sd-btn:active { transform: scale(0.88); }
  .sd-fab {
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
