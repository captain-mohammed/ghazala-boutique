<script>
  /* Shared glass/blur surface — one primitive for every card-like surface
     in the app. Default blur is 25px (40% above the old 18px standard).
     Usage:
       <Glass>...</Glass>
       <Glass blur={30} strong class="hero rise" style="animation-delay:.03s">...</Glass>
     `class` is merged (Svelte spreads would otherwise replace the base class). */
  let {
    blur = 25,
    saturate = 1.4,
    radius = 'var(--r-lg)',
    strong = false,
    class: cls = '',
    style = '',
    children,
    ...rest
  } = $props();

  /* vars + caller style merged (a spread style would otherwise wipe the vars) */
  const merged = $derived(`--g-blur:${blur}px; --g-sat:${saturate}; --g-radius:${radius}; ${style}`);
</script>

<div
  class="g {strong ? 'strong' : ''} {cls}"
  style={merged}
  {...rest}
>
  {@render children?.()}
</div>

<style>
  .g {
    background: var(--glass);
    backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
    -webkit-backdrop-filter: blur(var(--g-blur)) saturate(var(--g-sat));
    border: 1px solid var(--glass-border);
    border-radius: var(--g-radius);
    box-shadow: var(--glass-shadow);
  }
  .g.strong {
    background: var(--glass-strong);
  }
</style>
