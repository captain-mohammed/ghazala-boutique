<script>
  import { fade } from 'svelte/transition';
  import { springPop } from '../motion.js';
  import { confirmState, resolveConfirm } from '../store.js';
  import { buzz } from '../utils.js';

  let c = $derived($confirmState);
</script>

{#if c}
  <div class="backdrop" transition:fade={{ duration: 150 }} onclick={() => resolveConfirm(false)}>
    <div class="card glass-strong" in:springPop out:fade={{ duration: 140 }} onclick={(e) => e.stopPropagation()}>
      <h3>{c.title}</h3>
      {#if c.body}<p>{c.body}</p>{/if}
      <div class="row" style="gap:10px; margin-top:16px">
        <button class="btn ghost" style="flex:1" onclick={() => { buzz(6); resolveConfirm(false); }}>إلغاء</button>
        <button
          class="btn {c.danger ? 'danger' : 'primary'}"
          style="flex:1"
          onclick={() => { buzz(12); resolveConfirm(true); }}
        >{c.okLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(122, 46, 58, 0.25);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .card {
    width: 100%;
    max-width: 360px;
    padding: 22px 20px;
  }
  h3 { margin: 0 0 6px; color: var(--ink); font-size: 17px; }
  p { margin: 0; color: var(--ink-2); font-size: 14px; line-height: 1.7; }
</style>
