<script>
  import { fade } from 'svelte/transition';
  import { toastDrop } from '../motion.js';
  import { toasts } from '../store.js';
  import Icon from './Icon.svelte';
</script>

<div class="toast-wrap">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" in:toastDrop out:fade={{ duration: 180 }}>
      <span class="t-ic">
        <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={18} color="#FBF3EE" />
      </span>
      {t.message}
    </div>
  {/each}
</div>
