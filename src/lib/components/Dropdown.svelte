<script>
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let {
    value = $bindable(''),
    options = [], // [{ value, label, count? }]
    icon = 'chev',
    placeholder = 'الكل',
    onselect = () => {}
  } = $props();

  let open = $state(false);
  let root = $state(null);

  const current = $derived(options.find((o) => o.value === value));

  function pick(v) {
    value = v;
    buzz(6);
    open = false;
    onselect(v);
  }

  function onDocClick(e) {
    if (open && root && !root.contains(e.target)) open = false;
  }
  $effect(() => {
    document.addEventListener('pointerdown', onDocClick);
    return () => document.removeEventListener('pointerdown', onDocClick);
  });
</script>

<div class="dd" bind:this={root}>
  <button class="dd-btn" class:active={!!current && !current.clear} onclick={() => { buzz(5); open = !open; }} aria-expanded={open}>
    <span class="dd-ic"><Icon name={current && !current.clear ? (current.icon || icon) : icon} size={15} /></span>
    <span class="dd-label">{current && !current.clear ? current.label : placeholder}</span>
    <span class="dd-chev" class:flip={open}><Icon name="back" size={13} /></span>
  </button>

  {#if open}
    <div class="dd-pop glass-strong" transition:fly={{ y: 6, duration: 220, opacity: 1, easing: backOut }}>
      {#each options as o (o.value)}
        <button class="dd-opt" class:sel={o.value === value && !o.clear} onclick={() => pick(o.value)}>
          <span class="dd-opt-ic"><Icon name={o.icon || 'check'} size={15} color={o.value === value && !o.clear ? 'var(--burgundy)' : 'var(--taupe)'} /></span>
          <span class="dd-opt-label">{o.label}</span>
          {#if o.count != null}<span class="dd-opt-n">{o.count}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dd { position: relative; flex: 1; min-width: 0; }
  .dd-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .dd-btn:hover, .dd-btn.active { border-color: rgba(181, 73, 91, 0.35); background: rgba(255, 255, 255, 0.75); }
  .dd-btn.active { box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.1); }
  .dd-ic { display: inline-flex; color: var(--burgundy); flex: none; }
  .dd-label {
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: 13px;
    font-weight: 800;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dd-chev { display: inline-flex; color: var(--taupe); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); transform: rotate(90deg); }
  .dd-chev.flip { transform: rotate(-90deg); }
  .dd-pop {
    position: absolute;
    top: calc(100% + 6px);
    inset-inline-start: 0;
    min-width: 100%;
    width: max-content;
    max-width: 240px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 60; /* above item cards, sheet content, and every glass sibling */
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(255, 251, 247, 0.7); /* light glass — see-through so it pops */
    backdrop-filter: blur(28px) saturate(1.6);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    border: 1px solid rgba(255, 255, 255, 0.75);
    border-radius: var(--r-md);
    box-shadow: 0 18px 48px rgba(58, 26, 32, 0.22);
  }
  .dd-opt {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border: none;
    background: none;
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: right;
    transition: background 0.15s;
  }
  .dd-opt:hover { background: var(--accent-soft); }
  .dd-opt.sel { background: var(--accent-soft); }
  .dd-opt-ic { display: inline-flex; flex: none; }
  .dd-opt-label {
    flex: 1;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dd-opt-n {
    font-size: 11px;
    font-weight: 800;
    color: var(--taupe);
    background: rgba(122, 46, 58, 0.08);
    padding: 2px 7px;
    border-radius: 999px;
  }
</style>
