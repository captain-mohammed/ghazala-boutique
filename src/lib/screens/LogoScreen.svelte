<script>
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import { db, getSetting, setSetting } from '../db.js';
  import { fileToLogoDataUrl, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';
  import { logo } from '../store.js';

  let fileInput;
  let busy = $state(false);
  let hasCustom = $derived(!!$logo);

  async function pick() {
    fileInput?.click();
  }

  async function onFile(e) {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    busy = true;
    try {
      const dataUrl = await fileToLogoDataUrl(f, 256);
      await setSetting('logo', dataUrl);
      logo.set(dataUrl);
      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.6, '✨');
      toastOk('تم تحديث الشعار');
    } catch {
      toastErr('تعذر قراءة الصورة — جرّب صورة أخرى');
    } finally {
      busy = false;
    }
  }

  async function reset() {
    const ok = await askConfirm({
      title: 'استعادة الشعار الافتراضي؟',
      body: 'سيعود الشعار إلى حرف غ على البلاطة النبيتية.',
      okLabel: 'استعادة'
    });
    if (!ok) return;
    await setSetting('logo', null);
    logo.set(null);
    buzz(12);
    toastOk('أُعيد الشعار الافتراضي');
  }
</script>

<div class="stack" style="gap:14px">
  <section class="glass rise" style="padding:24px; display:flex; flex-direction:column; align-items:center; gap:12px">
    <Logo size={110} />
    <div class="bold">{hasCustom ? 'الشعار المخصص' : 'الشعار الافتراضي'}</div>
    <div class="muted small center">يظهر في شاشة القفل، الرئيسية، وهذه الصفحة</div>
  </section>

  <section class="glass rise" style="padding:16px; animation-delay:0.05s">
    <h2 class="h2" style="margin-bottom:10px"><Icon name="upload" size={17} color="var(--burgundy)" /> تغيير الشعار</h2>
    <p class="muted small" style="margin:0 0 12px">اختر صورة مربعة (مثالي 512×512). تُحفظ داخل جهازك فقط وتُصغَّر تلقائياً.</p>
    <input type="file" accept="image/*" style="display:none" bind:this={fileInput} onchange={onFile} />
    <button class="btn primary block" onclick={pick} disabled={busy}>
      <Icon name="image" size={18} /> {busy ? 'جارٍ المعالجة…' : 'اختيار صورة جديدة'}
    </button>
  </section>

  {#if hasCustom}
    <section class="glass rise" style="padding:16px; animation-delay:0.1s">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="undo" size={17} color="var(--taupe)" /> استعادة</h2>
      <button class="btn danger block" onclick={reset}>
        <Icon name="undo" size={18} /> استعادة الشعار الافتراضي
      </button>
    </section>
  {/if}
</div>
