import { onMount } from 'svelte';
import { saveDraft, loadDraft, clearDraft } from './db.js';
import { navGuard, askConfirm } from './store.js';

/* حارس المسودة القابل لإعادة الاستخدام — نفس حماية فاتورة الوارد والجرد،
   بسطرين في كل شاشة بدل تكرارها. استدعِه مرة واحدة أعلى <script> الشاشة
   (سياق تهيئة المكوّن) حتى تعمل المؤثرات داخله.

   opts:
     key          string  — مفتاح المسودة الفريد (مثل 'receive'، 'occasion')
     snapshot     () => object        — حالة النموذج الحالية (قابلة للتسلسل)
     hasContent   (s) => boolean      — هل s غير فارغ؟
     restore      (s) => void         — طبّق مسودة مستعادة على النموذج
     reset        () => void          — أفرغ النموذج
     goto?        (id) => void        — دالة التنقل (من الخاصيات)
     exitTo?      string (افتراضي 'more') — وجهة الخروج عند تأكيد زر الرجوع
     onExit?      () => void          — يلغي goto/exitTo عند تأكيد الخروج
     confirmTitle / confirmBody / okLabel — نص حوار زر الرجوع

   يُعيد: { ready, showRecover, dismiss, discard } */
export function useDraft(opts) {
  const {
    key,
    snapshot,
    hasContent,
    restore,
    reset,
    goto,
    exitTo = 'more',
    onExit = null,
    confirmTitle = 'مسودة غير محفوظة',
    confirmBody = 'عندك بيانات لم تُحفظ. تريدين المتابعة بلا حفظ؟',
    okLabel = 'متابعة بلا حفظ'
  } = opts;

  let ready = $state(false);
  let showRecover = $state(false);
  let trapArmed = false;
  let saveTimer;

  const isDirty = () => ready && hasContent(snapshot());

  async function discard() {
    await clearDraft(key).catch(() => {});
    reset();
    showRecover = false;
  }
  function flush() {
    if (!ready) return;
    const s = snapshot();
    if (hasContent(s)) saveDraft(key, s).catch(() => {});
  }
  function onVisibility() { if (document.hidden) flush(); }
  function onPop() {
    if (!isDirty()) { trapArmed = false; return; }
    history.pushState({ ghazalaTrap: true }, '');
    trapArmed = true;
    askConfirm({ title: confirmTitle, body: confirmBody, okLabel, danger: true }).then((ok) => {
      if (ok) {
        clearDraft(key).catch(() => {});
        trapArmed = false;
        if (onExit) onExit();
        else if (goto) goto(exitTo);
      }
    });
  }

  (async () => {
    try {
      const d = await loadDraft(key);
      if (d && hasContent(d)) { restore(d); showRecover = true; }
    } catch { /* لا تعطّل الفتح */ }
    ready = true;
    navGuard.set(() => isDirty());
  })();

  onMount(() => {
    window.addEventListener('popstate', onPop);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      navGuard.set(null);
      if (trapArmed) { try { history.back(); } catch { /* noop */ } trapArmed = false; }
    };
  });

  /* الحفظ التلقائي: يكتب المسودة بعد كل تغيير (debounce). */
  $effect(() => {
    if (!ready) return;
    const s = snapshot();
    if (!hasContent(s)) { clearDraft(key).catch(() => {}); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(key, s).catch(() => {}), 600);
  });

  /* نسلّح فخّ الرجوع فقط حين توجد مسودة متسخة. */
  $effect(() => {
    const dirty = isDirty();
    if (dirty && !trapArmed) { history.pushState({ ghazalaTrap: true }, ''); trapArmed = true; }
    else if (!dirty && trapArmed) { history.back(); trapArmed = false; }
  });

  /* getters تحفظ التفاعل عبر حدود الدالة — العائد المباشر يلتقط القيمة الابتدائية فقط */
  return {
    get ready() { return ready; },
    get showRecover() { return showRecover; },
    dismiss: () => (showRecover = false),
    discard,
    isDirty
  };
}
