<script>
  import { longpress } from '../motion.js';

  /* Shared glass/blur surface — one primitive for every card-like surface
     in the app. Default blur is 25px (40% above the old 18px standard).
     Usage:
       <Glass>...</Glass>
       <Glass as="button" class="alert rise" use:tilt onclick={...}>...</Glass>
       <Glass blur={30} strong class="hero rise" style="animation-delay:.03s">...</Glass>
     `class` is merged (a Svelte spread would otherwise replace the base class),
     and every class this component renders is global — the host element is
     created here, so the caller's scoped CSS cannot see it. Style the surface
     with global classes (shared stylesheet) or an inline `style` prop. */
  let {
    as = 'div',
    blur = 25,
    saturate = 1.4,
    radius = 'var(--r-lg)',
    strong = false,
    class: cls = '',
    style = '',
    action = null, /* motion action (e.g. tilt) applied to the host element */
    onlongpress = null, /* forwarded custom event from the longpress action */
    children,
    ...rest
  } = $props();

  /* vars + caller style merged (a spread style would otherwise wipe the vars) */
  const merged = $derived(`--g-blur:${blur}px; --g-sat:${saturate}; --g-radius:${radius}; ${style}`);

  let el = $state(null);
  let lpCleanup = null;
  $effect(() => {
    if (!action || !el) return;
    const ret = action(el);
    return () => ret?.destroy?.();
  });
  /* long-press: apply the action + forward its CustomEvent */
  $effect(() => {
    if (!onlongpress || !el) return;
    const ret = longpress(el);
    const handler = (e) => onlongpress(e);
    el.addEventListener('longpress', handler);
    lpCleanup = () => {
      el.removeEventListener('longpress', handler);
      ret?.destroy?.();
    };
    return () => { lpCleanup?.(); lpCleanup = null; };
  });
</script>

<svelte:element
  bind:this={el}
  this={as}
  class="g {strong ? 'strong' : ''} {cls}"
  style={merged}
  {...rest}
>
  {@render children?.()}
</svelte:element>

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
