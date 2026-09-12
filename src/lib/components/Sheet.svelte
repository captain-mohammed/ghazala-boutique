<script>
  import { fade, fly } from 'svelte/transition';
  import { sheetSpring } from '../motion.js';
  let { open = false, title = '', onclose = () => {}, children, footer = null } = $props();

  /* ---- سحب الورقة للأسفل للإغلاق — تتبع الإصبع مع ارتداد مرن ---- */
  let pull = $state(0);
  let dragging = $state(false);
  let y0 = 0;

  function onStart(e) {
    if (e.pointerType === 'mouse') return;
    dragging = true;
    y0 = e.clientY;
  }
  function onMove(e) {
    if (!dragging) return;
    pull = Math.max(0, e.clientY - y0);
  }
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    if (pull > 110) onclose();
    pull = 0;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="sheet-backdrop"
    transition:fade={{ duration: 180 }}
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  ></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet"
    class:dragging
    style="transform: translateY({pull}px)"
    in:sheetSpring
    out:fly={{ y: 460, duration: 260, opacity: 1 }}
    onpointerdown={onStart}
    onpointermove={onMove}
    onpointerup={onEnd}
    onpointercancel={onEnd}
  >
    <div class="sheet-grab"></div>
    {#if title}
      <div class="sheet-head">
        <h2 class="h2">{title}</h2>
        <button class="iconbtn" aria-label="إغلاق" onclick={onclose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
    {/if}
    <div class="sheet-body noscroll">
      {@render children?.()}
    </div>
    {#if footer}
      <div class="sheet-foot">{@render footer()}</div>
    {/if}
  </div>
{/if}

<style>
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 18px 6px;
    flex: none;
  }
  .sheet-foot {
    flex: none;
    padding: 10px 18px 6px;
    border-top: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.35);
    border-radius: 0 0 var(--r-lg) var(--r-lg);
  }
  /* أثناء السحب: بلا انتقال — تتبع الإصبع؛ عند الإفلات يرتد بسلاسة */
  .sheet { will-change: transform; }
  .sheet.dragging { transition: none !important; cursor: grabbing; }
</style>
