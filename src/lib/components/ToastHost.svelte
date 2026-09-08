<script>
  import { fly, fade } from 'svelte/transition';
  import { toasts } from '../store.js';
  import Icon from './Icon.svelte';
</script>

<div class="toast-wrap">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" transition:fly={{ y: -26, duration: 260 }}>
      <span class="t-ic">
        <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={18} color="#FBF3EE" />
      </span>
      {t.message}
    </div>
  {/each}
</div>
