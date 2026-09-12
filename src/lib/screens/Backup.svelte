<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, backupJSON, restoreJSON, getSetting, setSetting } from '../db.js';
  import { downloadFile, fmtDate, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';
  import * as XLSX from 'xlsx';

  let lastBackup = $state(null);
  let restoreOpen = $state(false);
  let pendingData = $state(null);
  let fileInput;

  onMount(async () => {
    lastBackup = await getSetting('lastBackupAt', null);
  });

  const counts = $derived.by(() => {
    // lightweight counters (updated by re-query on mount)
    return null;
  });

  async function doBackup() {
    const data = await backupJSON();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`ghazala-backup-${stamp}.json`, JSON.stringify(data, null, 2));
    const now = new Date().toISOString();
    await setSetting('lastBackupAt', now);
    lastBackup = now;
    buzz([20, 50, 20]);
    celebrateAt(window.innerWidth / 2, window.innerHeight / 2.6, '💾');
    toastOk('تم حفظ النسخة في مجلد التنزيلات');
  }

  function pickFile() {
    fileInput?.click();
  }

  async function onFile(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (data.app !== 'ghazala-boutique') { toastErr('ملف غير صالح — هذا ليس ملف نسخة غزالة'); return; }
      pendingData = data;
      restoreOpen = true;
    } catch {
      toastErr('تعذر قراءة الملف');
    } finally {
      e.currentTarget.value = '';
    }
  }

  async function doRestore(replace) {
    try {
      await restoreJSON(pendingData, { merge: !replace });
      restoreOpen = false;
      pendingData = null;
      buzz([30, 60, 30]);
      toastOk(replace ? 'تمت الاستعادة الكاملة' : 'تمت إضافة البيانات');
    } catch (err) {
      console.error(err);
      toastErr('فشلت الاستعادة');
    }
  }

  async function exportExcel() {
    const [products, sales] = await Promise.all([db.products.toArray(), db.sales.toArray()]);
    const wb = XLSX.utils.book_new();

    const pRows = products.map((p) => ({
      'الكود': p.sku, 'الاسم': p.name, 'التصنيف': p.category, 'النوع': p.type || '',
      'الموسم': (Array.isArray(p.seasons) && p.seasons.length ? p.seasons.join(' - ') : (p.season || '')), 'المادة': p.material || '', 'المورد': p.supplier || '',
      'الماركة': p.brand || '', 'اللون': p.color || '', 'المقاس': p.size || '',
      'التكلفة': p.cost, 'سعر البيع': p.price, 'الكمية': p.qty,
      'ملاحظات': p.notes || '', 'آخر تحديث': p.updatedAt
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pRows.length ? pRows : [{ 'الكود': '' }]), 'المخزون');

    const sRows = sales.flatMap((s) =>
      s.items.map((it) => ({
        'رقم العملية': s.id, 'التاريخ': s.date, 'الزبون': s.customerName || '',
        'الهاتف': s.customerPhone || '', 'الحالة': s.status,
        'الموديل': it.name, 'الكود': it.sku, 'الكمية': it.qty,
        'السعر': it.price, 'الإجمالي': s.total, 'أجور التوصيل': s.deliveryFee,
        'باركود الشحنة': s.barcode || ''
      }))
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sRows.length ? sRows : [{ 'رقم العملية': '' }]), 'المبيعات');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`ghazala-${stamp}.xlsx`, new Blob([out]), 'application/octet-stream');
    buzz([20, 40, 20]);
    toastOk('تم تصدير ملف الإكسل');
  }

  const reminder = $derived.by(() => {
    if (!lastBackup) return { on: true, level: 'bad', days: null, score: 0, msg: 'لم تأخذي نسخة احتياطية بعد — خُذي أول نسخة الآن.' };
    const days = Math.floor((Date.now() - new Date(lastBackup)) / 86400000);
    if (days >= 14) return { on: true, level: 'bad', days, score: 1, msg: `آخر نسخة منذ ${days} يوم — بياناتك في خطر لو انمسحت. خذي نسخة جديدة الحين.` };
    if (days >= 7) return { on: true, level: 'gold', days, score: 2, msg: `التذكير الأسبوعي: آخر نسخة منذ ${days} يوم — جدّدي نسختك.` };
    return { on: false, level: 'good', days, score: 3, msg: `آخر نسخة: ${fmtDate(lastBackup)}` };
  });
</script>

<div class="stack" style="gap:12px">
  <Glass class="rise bk-card bk-{reminder.level}" style="padding:16px; animation-delay:0s; border-radius:var(--r-lg)">
    <div class="row" style="gap:10px; margin-bottom:10px">
      <Icon name={reminder.on ? 'alert' : 'check'} size={19} color={reminder.level === 'good' ? 'var(--good)' : reminder.level === 'gold' ? 'var(--gold)' : 'var(--burgundy)'} />
      <span class="bold small" style="flex:1">{reminder.level === 'good' ? 'نسختك حديثة' : reminder.level === 'gold' ? 'تذكير أسبوعي' : 'النسخة متأخرة'}</span>
      <span class="health" title="درجة صحة النسخ الاحتياطي">
        {#each [3, 2, 1] as n (n)}<i class={reminder.score >= n ? 'on' : ''}></i>{/each}
      </span>
    </div>
    <p class="muted small" style="margin:0 0 12px">{reminder.msg} بياناتك محفوظة في هذا الجهاز فقط — النسخة الاحتياطية هي حمايتك الوحيدة من مسح بيانات المتصفح.</p>
    <button class="btn {reminder.level === 'good' ? 'primary' : 'gold'} block" onclick={doBackup}>
      <Icon name="download" size={18} /> أخذ نسخة احتياطية الآن
    </button>
  </Glass>

  <Glass class="rise" style="padding:16px; animation-delay:0.05s">
    <h2 class="h2" style="margin-bottom:10px"><Icon name="upload" size={17} color="var(--burgundy)" /> استعادة نسخة</h2>
    <p class="muted small" style="margin:0 0 12px">اختاري ملف ghazala-backup-…json لاستعادة بياناتك على هذا الجهاز أو جهاز جديد.</p>
    <input type="file" accept=".json,application/json" style="display:none" bind:this={fileInput} onchange={onFile} />
    <button class="btn block" onclick={pickFile}>
      <Icon name="file" size={18} /> اختيار ملف النسخة
    </button>
  </Glass>

  <Glass class="rise" style="padding:16px; animation-delay:0.1s">
    <h2 class="h2" style="margin-bottom:10px"><Icon name="file" size={17} color="var(--gold)" /> تصدير إكسل</h2>
    <p class="muted small" style="margin:0 0 12px">ملف .xlsx بورقتين: المخزون والمبيعات — يفتح في أي برنامج جداول.</p>
    <button class="btn gold block" onclick={exportExcel}>
      <Icon name="download" size={18} /> تصدير إلى Excel
    </button>
  </Glass>
</div>

<Sheet open={restoreOpen} title="طريقة الاستعادة" onclose={() => { restoreOpen = false; pendingData = null; }}>
  <div class="stack" style="gap:12px">
    <p class="muted small" style="margin:0">
      النسخة تحتوي {pendingData?.products?.length ?? 0} موديل و{pendingData?.sales?.length ?? 0} عملية بيع.
    </p>
    <button class="btn primary block" onclick={() => doRestore(false)}>
      إضافة للبيانات الحالية (دمج)
    </button>
    <button class="btn danger block" onclick={() => doRestore(true)}>
      استبدال كل البيانات الحالية
    </button>
    <button class="btn ghost block" onclick={() => { restoreOpen = false; pendingData = null; }}>إلغاء</button>
  </div>
</Sheet>

<style>
  :global(.bk-card) { position: relative; }
  :global(.bk-card.bk-gold) { border-color: rgba(201, 161, 90, 0.55) !important; box-shadow: 0 8px 26px rgba(164, 128, 62, 0.18); }
  :global(.bk-card.bk-bad) { border-color: rgba(181, 73, 91, 0.5) !important; }
  .health { display: inline-flex; gap: 4px; align-items: center; }
  .health i {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--line-2);
    transition: background 0.3s, box-shadow 0.3s;
  }
  .health i.on { background: var(--gold); box-shadow: 0 0 8px rgba(201, 161, 90, 0.5); }
</style>
