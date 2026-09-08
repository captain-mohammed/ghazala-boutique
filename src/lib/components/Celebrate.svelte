<script>
  import { celebrate } from '../store.js';

  let burst = $state(null);
  const COLORS = ['#B5495B', '#C9A15A', '#7A2E3A', '#E8B4B8', '#D4B276'];

  $effect(() => {
    const ev = $celebrate;
    if (!ev) return;
    const parts = Array.from({ length: 26 }, (_, i) => ({
      id: i,
      dx: (Math.random() - 0.5) * 340,
      dy: -Math.random() * 300 - 40,
      rot: Math.random() * 720 - 360,
      size: 6 + Math.random() * 8,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.12
    }));
    burst = { ...ev, parts };
    // sparks fly from the exact tapped button first, then the confetti blooms
    if (typeof ev.ox === 'number') sparkFromRectAt(ev.ox, ev.oy, 16);
    const t = setTimeout(() => (burst = null), 1500);
    return () => clearTimeout(t);
  });

  function sparkFromRectAt(x, y, n) {
    import('../motion.js').then((m) => m.spawnSparks(x, y, n));
  }
</script>

{#if burst}
  <div class="celebrate" style="left:{burst.x}px; top:{burst.y}px" aria-hidden="true">
    <span class="emoji">{burst.emoji}</span>
    {#each burst.parts as p (p.id)}
      <span
        class="p"
        style="--dx:{p.dx}px; --dy:{p.dy}px; --rot:{p.rot}deg; --size:{p.size}px; --c:{p.color}; --d:{p.delay}s"
      ></span>
    {/each}
  </div>
{/if}

<style>
  .celebrate {
    position: fixed;
    z-index: 95;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }
  .emoji {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translate(-50%, 0);
    font-size: 46px;
    animation: emojiPop 1.1s cubic-bezier(0.22, 1.4, 0.36, 1) forwards;
    filter: drop-shadow(0 6px 16px rgba(122, 46, 58, 0.3));
  }
  .p {
    position: absolute;
    width: var(--size);
    height: var(--size);
    border-radius: 30% 70% 60% 40% / 50% 40% 60% 50%;
    background: var(--c);
    animation: part 1.15s cubic-bezier(0.15, 0.6, 0.4, 1) var(--d) forwards;
    opacity: 0;
  }
  @keyframes emojiPop {
    0% { transform: translate(-50%, 10px) scale(0.3); opacity: 0; }
    25% { transform: translate(-50%, -12px) scale(1.25); opacity: 1; }
    70% { transform: translate(-50%, -30px) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -52px) scale(0.9); opacity: 0; }
  }
  @keyframes part {
    0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: 0; }
  }
</style>
