<script>
  /* Shared variant line — one visual language for colors × sizes everywhere:
     sale cards, report rows, checkout items… give it [{ color, size, qty? }]
     and it renders a dot per color with its sizes. */
  import { hexForColor } from '../db.js';

  let { variants = [], colors = null, dense = false } = $props();

  const rows = $derived.by(() => {
    const m = new Map();
    for (const v of variants || []) {
      const c = (v.color || '').trim();
      if (!m.has(c)) m.set(c, { color: c, sizes: [] });
      const e = m.get(c);
      const sz = String(v.size || '').trim();
      if (sz && !e.sizes.includes(sz)) e.sizes.push(sz);
    }
    const out = [...m.values()].filter((e) => e.color || e.sizes.length);
    for (const e of out) e.sizes.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    return out;
  });
</script>

{#if rows.length}
  <div class="vb" class:dense>
    {#each rows as r (r.color)}
      <span class="vb-item">
        {#if r.color}
          <i class="vb-dot" style="background:{hexForColor(r.color, colors)}"></i>
          <span class="vb-name">{r.color}</span>
        {/if}
        {#if r.sizes.length}<span class="vb-sizes">مقاس {r.sizes.join('، ')}</span>{/if}
      </span>
    {/each}
  </div>
{/if}

<style>
  .vb { display: flex; flex-wrap: wrap; gap: 3px 10px; align-items: center; }
  .vb-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
  .vb-dot {
    flex: none;
    width: 11px; height: 11px;
    border-radius: 50%;
    border: 1.5px solid var(--line-2);
  }
  .vb-name { font-size: 11px; font-weight: 800; color: var(--ink-2); white-space: nowrap; }
  .vb-sizes { font-size: 10.5px; font-weight: 700; color: var(--taupe); white-space: nowrap; }
  .vb.dense .vb-dot { width: 9px; height: 9px; border-width: 1px; }
  .vb.dense .vb-name { font-size: 10px; }
  .vb.dense .vb-sizes { font-size: 9.5px; }
</style>
