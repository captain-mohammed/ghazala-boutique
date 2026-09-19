<script>
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  /* منتقي مصدر الصورة — الكاميرا أو المعرض.
     قبل هذا كان حقل الصورة مربوطاً بـ capture="environment" فيفتح الكاميرا
     مباشرةً ولا سبيل لاختيار صورة موجودة أصلاً في الهاتف. الآن الاختيار صريح:
     onpick('camera' | 'gallery'). */
  let { open = false, onclose = () => {}, onpick = () => {} } = $props();

  function pick(src) {
    buzz(8);
    onpick(src);
  }
</script>

<Sheet {open} {onclose} title="من وين نجيب الصورة؟">
  <div class="srcs">
    <button type="button" class="src" onclick={() => pick('camera')}>
      <span class="s-ic"><Icon name="camera" size={22} color="var(--burgundy)" /></span>
      <span class="s-txt">
        <span class="s-t">صوّريها بالكاميرا</span>
        <span class="muted tiny">صورة جديدة من الآن</span>
      </span>
    </button>
    <button type="button" class="src" onclick={() => pick('gallery')}>
      <span class="s-ic"><Icon name="image" size={22} color="var(--burgundy)" /></span>
      <span class="s-txt">
        <span class="s-t">اختاري من المعرض</span>
        <span class="muted tiny">صورة محفوظة في هاتفك</span>
      </span>
    </button>
  </div>
</Sheet>

<style>
  .srcs { display: flex; flex-direction: column; gap: 10px; }
  .src {
    display: flex; align-items: center; gap: 12px; text-align: start;
    width: 100%; cursor: pointer; font-family: inherit;
    border: 1px solid var(--line-2); border-radius: 16px;
    background: rgba(255, 255, 255, 0.55); padding: 13px 14px;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.18s;
  }
  .src:active { transform: scale(0.98); }
  .s-ic {
    flex: none; width: 42px; height: 42px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px; background: var(--accent-soft);
  }
  .s-txt { display: flex; flex-direction: column; gap: 1px; }
  .s-t { font-weight: 800; font-size: 14.5px; color: var(--ink); }
</style>
