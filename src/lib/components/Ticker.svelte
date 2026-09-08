<script>
  import { fmtNum } from '../utils.js';

  let { value = 0, duration = 900, suffix = '', class: klass = '' } = $props();

  let display = $state(0);
  let raf = null;
  let first = true;

  $effect(() => {
    const target = value;
    if (raf) cancelAnimationFrame(raf);
    if (first) {
      first = false;
      const from = 0;
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        display = from + (target - from) * (1 - Math.pow(1 - p, 3));
        if (p < 1) raf = requestAnimationFrame(step);
        else display = target;
      };
      raf = requestAnimationFrame(step);
      return () => raf && cancelAnimationFrame(raf);
    }
    const from = display;
    const delta = target - from;
    if (delta === 0) return;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      display = from + delta * (1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(step);
      else display = target;
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  });
</script>

<span class="ticker {klass}">{fmtNum(display)}{suffix}</span>

<style>
  .ticker {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
  }
</style>
