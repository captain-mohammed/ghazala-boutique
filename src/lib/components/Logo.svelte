<script>
  import { logo } from '../store.js';

  /** size in px; bg=false renders the image raw with rounded corners */
  let { size = 54, radius = 0.28, bg = false } = $props();

  let markOk = $state(true); // flips false only if the bundled wordmark fails to load
</script>

{#if $logo}
  <img
    class="logo-img"
    src={$logo}
    alt="شعار بوتيك غزالة"
    style="width:{size}px; height:{size}px; border-radius:{Math.round(size * radius)}px"
  />
{:else if markOk}
  <img
    class="logo-mark"
    src="./brand/wordmark.png"
    alt="شعار بوتيك غزالة"
    style="width:{size}px; height:{Math.round(size * 0.98)}px"
    onerror={() => (markOk = false)}
  />
{:else}
  <div
    class="logo-default"
    style="width:{size}px; height:{size}px; border-radius:{Math.round(size * radius)}px; font-size:{Math.round(size * 0.56)}px"
  >
    غ
  </div>
{/if}

<style>
  .logo-img {
    object-fit: cover;
    display: block;
    box-shadow: 0 8px 20px rgba(122, 46, 58, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.5);
  }
  .logo-mark {
    object-fit: contain;
    display: block;
    /* drop-shadow follows the transparent ink silhouette, not a box */
    filter: drop-shadow(0 6px 14px rgba(122, 46, 58, 0.2));
  }
  .logo-default {
    background: linear-gradient(135deg, var(--burgundy), var(--burgundy-deep));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ivory);
    box-shadow: 0 8px 20px rgba(122, 46, 58, 0.28), inset 0 2px 8px rgba(255, 255, 255, 0.25);
    flex: none;
  }
</style>
