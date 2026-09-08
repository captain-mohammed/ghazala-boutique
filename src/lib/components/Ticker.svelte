<script>
  let { value = 0, duration = 850, suffix = '', class: klass = '' } = $props();

  let shown = $state(0); // the value the odometer is currently gliding to
  let flash = $state(false);
  let first = true;

  $effect(() => {
    const v = value;
    if (first) {
      first = false;
      // first paint shows 0, then the digits roll up to the target
      // (double rAF: let the 0-state paint before transitioning)
      let r2;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => (shown = v));
      });
      return () => { cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
    }
    shown = v;
    flash = true;
    const t = setTimeout(() => (flash = false), duration + 150);
    return () => clearTimeout(t);
  });

  // formatToParts returns multi-digit chunks ('54', '000') — flatten
  // into one token per rendered glyph: digits roll, commas sit still
  const tokens = $derived(
    new Intl.NumberFormat('en-US')
      .formatToParts(Math.round(Math.abs(shown)))
      .flatMap((p) =>
        p.type === 'group'
          ? [{ t: 'sep', v: ',' }]
          : [...p.value].map((ch) => ({ t: 'digit', v: ch }))
      )
  );
</script>

<span class="ticker {klass}" class:odo-flash={flash}>
  {#each tokens as tok, i (`${tokens.length}:${i}`)}
    {#if tok.t === 'sep'}
      <span class="sep">{tok.v}</span>
    {:else}
      <span class="odo-digit-window">
        <span
          class="odo-digit-col"
          style="transform: translateY(-{(+tok.v) * 10}%); transition-duration:{duration}ms"
        >
          {#each Array(10) as _, n (n)}<span>{n}</span>{/each}
        </span>
      </span>
    {/if}
  {/each}
  {suffix}
</span>

<style>
  .ticker {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
    display: inline-flex;
    align-items: baseline;
    white-space: nowrap;
    direction: ltr; /* digit windows must flow 54,000 — the RTL page reorders separate elements */
  }
  /* first paint: every column starts at 0 and rolls up to its digit (CSS-native mount animation) */
  @starting-style {
    .odo-digit-col {
      transform: translateY(0%);
    }
  }
</style>
