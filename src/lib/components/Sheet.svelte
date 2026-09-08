<script>
  import { fade, fly } from 'svelte/transition';
  let { open = false, title = '', onclose = () => {}, children, footer = null } = $props();
</script>

{#if open}
  <div
    class="sheet-backdrop"
    transition:fade={{ duration: 180 }}
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  ></div>
  <div class="sheet" transition:fly={{ y: 420, duration: 340, opacity: 1 }}>
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
</style>
