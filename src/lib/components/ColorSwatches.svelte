<script>
  import { COLOR_SWATCHES } from '../db.js';
  import { buzz } from '../utils.js';

  let { value = $bindable(''), label = 'اللون' } = $props();

  const isActive = (s) => value.trim().toLowerCase() === s.label.toLowerCase();

  function pick(s) {
    value = isActive(s) ? '' : s.label;
    buzz(6);
  }
</script>

<div class="field">
  <label>{label}</label>
  <div class="sw-row">
    {#each COLOR_SWATCHES as s (s.label)}
      <button
        type="button"
        class="sw" class:on={isActive(s)} class:ring={!!s.ring}
        style="--sw:{s.hex}"
        aria-label={s.label} title={s.label}
        onclick={() => pick(s)}
      ></button>
    {/each}
  </div>
  <input class="input sw-text" bind:value={value} placeholder="أسود — أو اكتب أي لون…" />
</div>

<style>
  .sw-row { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 8px; }
  .sw {
    width: 34px; height: 34px;
    border-radius: 50%;
    border: 1.5px solid var(--line-2);
    background: var(--sw);
    cursor: pointer;
    padding: 0;
    box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.28), inset 0 -3px 6px rgba(0, 0, 0, 0.16);
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s;
  }
  .sw:active { transform: scale(0.86); }
  .sw.ring { border-color: rgba(58, 26, 32, 0.22); }
  .sw.on {
    transform: scale(1.12);
    box-shadow:
      inset 0 2px 5px rgba(255, 255, 255, 0.28),
      inset 0 -3px 6px rgba(0, 0, 0, 0.16),
      0 0 0 2.5px #fbf3ee,
      0 0 0 5px var(--burgundy);
  }
  .sw-text { height: 46px; }
</style>
