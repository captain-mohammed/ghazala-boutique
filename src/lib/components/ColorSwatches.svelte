<script>
  import { buzz } from '../utils.js';

  let {
    value = $bindable(''),
    colors = [],
    label = 'اللون',
    hint = 'اختاري من الدوائر',
    multi = false,
    selected = [],
    onselect = () => {}
  } = $props();

  const isOn = (c) => multi
    ? selected.includes(c.label)
    : value.trim().toLowerCase() === String(c.label).trim().toLowerCase();

  function pick(c) {
    if (multi) onselect(c.label);
    else value = isOn(c) ? '' : c.label;
    buzz(6);
  }

  const picked = $derived(multi ? selected : (value ? [value] : []));
  const hexOf = (l) => colors.find((c) => c.label === l)?.hex || 'var(--taupe)';
</script>

<div class="field">
  <label>{label} <span class="muted tiny">— {hint}</span></label>
  <div class="sw-row">
    {#each colors as c (c.label)}
      <button
        type="button"
        class="sw" class:on={isOn(c)}
        style="--sw:{c.hex}"
        aria-label={c.label} title={c.label}
        onclick={() => pick(c)}
      ></button>
    {/each}
  </div>
  {#if picked.length}
    <div class="sw-picked">
      {#each picked as p (p)}
        <span class="sp" style="--sw:{hexOf(p)}">{p}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sw-row { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 4px; }
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
  .sw.on {
    transform: scale(1.12);
    box-shadow:
      inset 0 2px 5px rgba(255, 255, 255, 0.28),
      inset 0 -3px 6px rgba(0, 0, 0, 0.16),
      0 0 0 2.5px var(--bg, #FBF3EE),
      0 0 0 5px var(--burgundy);
  }
  .sw-picked { display: flex; flex-wrap: wrap; gap: 6px; }
  .sp {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12px; font-weight: 800; color: var(--ink);
    background: var(--accent-soft);
    border-radius: 999px; padding: 4px 10px;
  }
  .sp::before {
    content: '';
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--sw);
    border: 1px solid var(--line-2);
  }
</style>
