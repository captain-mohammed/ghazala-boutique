<script>
  /* حلقة الهدف — a thin gold ring that fills as today's pieces approach the
     daily target. Animated with a real stroke-dashoffset transition so it
     moves only when the number moves, never on its own. */
  let { value = 0, target = 0, size = 44, stroke = 4 } = $props();

  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const pct = $derived(target > 0 ? Math.max(0, Math.min(1, value / target)) : 0);
  const done = $derived(target > 0 && value >= target);
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" class="ring" class:done role="img" aria-label="تقدم الهدف اليومي">
  <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="rgba(122,46,58,0.12)" stroke-width={stroke} />
  <circle
    cx={size / 2} cy={size / 2} {r} fill="none"
    stroke="url(#ring-gold)"
    stroke-width={stroke}
    stroke-linecap="round"
    stroke-dasharray={c}
    stroke-dashoffset={c * (1 - pct)}
    transform="rotate(-90 {size / 2} {size / 2})"
  />
  <defs>
    <linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--gold)" />
      <stop offset="1" stop-color="#a4803e" />
    </linearGradient>
  </defs>
</svg>

<style>
  .ring circle:last-of-type {
    transition: stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .ring.done circle:last-of-type {
    filter: drop-shadow(0 0 4px rgba(201, 161, 90, 0.55));
  }
</style>
