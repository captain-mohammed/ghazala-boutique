<script>
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let { sizes = [], value = $bindable({}) } = $props();

  let custom = $state('');

  const shown = $derived.by(() => {
    const base = [...sizes];
    for (const s of Object.keys(value)) {
      if (String(s).trim() && !base.includes(String(s).trim())) base.push(String(s).trim());
    }
    return base;
  });

  const total = $derived(Object.values(value).reduce((a, n) => a + (Number(n) || 0), 0));

  function bump(s, d) {
    const q = (Number(value[s]) || 0) + d;
    const next = { ...value };
    if (q <= 0) delete next[s];
    else next[s] = q;
    value = next;
    buzz(d > 0 ? 6 : 8);
  }

  function addCustom() {
    const s = custom.trim();
    if (!s) return;
    if (!shown.includes(s)) value = { ...value, [s]: 0 };
    custom = '';
    buzz(8);
  }
</script>

<div class="grid">
  {#each shown as s (s)}
    <div class="cell" class:on={value[s] > 0}>
      <div class="sz">{s}</div>
      {#if value[s] > 0}
        <div class="mini">
          <button type="button" class="m-btn" onclick={() => bump(s, -1)} aria-label="نقصان {s}">−</button>
          <span class="m-n">{value[s]}</span>
          <button type="button" class="m-btn" onclick={() => bump(s, +1)} aria-label="زيادة {s}">+</button>
        </div>
      {:else}
        <button type="button" class="take" onclick={() => bump(s, +1)}>أضف</button>
      {/if}
    </div>
  {/each}
</div>
<div class="row" style="gap:8px; margin-top:8px">
  <input class="input" style="flex:1; height:44px" bind:value={custom} placeholder="مقاس آخر…" inputmode="decimal"
    onkeydown={(e) => e.key === 'Enter' && addCustom()} />
  <button type="button" class="btn" style="min-height:44px; flex:none" onclick={addCustom}>
    <Icon name="plus" size={16} /> مقاس
  </button>
</div>
{#if total > 0}
  <div class="sum pop">
    <span class="bold">{total}</span> قطعة في <span class="bold">{Object.keys(value).length}</span> مقاس — تُحفظ بضغطة واحدة
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; }
  .cell {
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.45);
    border-radius: 14px;
    padding: 8px 6px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
  }
  .cell.on {
    border-color: rgba(181, 73, 91, 0.45);
    background: rgba(181, 73, 91, 0.07);
    box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.09);
  }
  .sz { font-size: 15px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .take {
    border: none; background: none; cursor: pointer;
    font-family: inherit; font-size: 11px; font-weight: 800;
    color: var(--taupe); padding: 2px 6px;
  }
  .mini { display: flex; align-items: center; gap: 6px; }
  .m-btn {
    width: 26px; height: 26px;
    border-radius: 8px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.7);
    font-size: 16px; font-weight: 800; color: var(--burgundy);
    cursor: pointer; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    transition: transform 0.13s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .m-btn:active { transform: scale(0.82); }
  .m-n { min-width: 18px; text-align: center; font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums; }
  .sum {
    margin-top: 8px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--taupe);
    background: var(--gold-soft, rgba(201, 162, 75, 0.12));
    border: 1px dashed rgba(201, 162, 75, 0.4);
    border-radius: 12px;
    padding: 8px 12px;
  }
</style>
