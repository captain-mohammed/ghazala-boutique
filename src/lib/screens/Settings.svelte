<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, allSettings, setSetting, seedDemo, wipeAll, DEFAULT_CATEGORIES } from '../db.js';
  import { fmtIQD, buzz, hashPin, WA_VARS, DEFAULT_WA_TEMPLATE, buildSalesMessage } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  let fee = $state('');
  let low = $state(3);
  let deadDays = $state(30);
  let cats = $state([]);
  let newCat = $state('');
  let loaded = $state(false);

  /* WhatsApp message template */
  let waText = $state(DEFAULT_WA_TEMPLATE);
  let waTouched = $state(false);
  let waBox = $state(false);

  onMount(async () => {
    const s = await allSettings();
    fee = s.deliveryFee;
    low = s.lowStockThreshold;
    deadDays = s.deadStockDays;
    cats = [...(s.categories || DEFAULT_CATEGORIES)];
    if (typeof s.waTemplate === 'string' && s.waTemplate.trim()) {
      waText = s.waTemplate;
      waTouched = true;
    }
    loaded = true;
  });

  async function saveFee() {
    await setSetting('deliveryFee', Math.max(0, Number(fee) || 0));
    toastOk(`أجور التوصيل: ${fmtIQD(Number(fee) || 0)}`);
    buzz(10);
  }
  async function saveLow() {
    await setSetting('lowStockThreshold', Math.max(0, Math.round(Number(low) || 0)));
    toastOk('تم حفظ حد التنبيه');
    buzz(10);
  }
  async function saveDead() {
    await setSetting('deadStockDays', Math.max(1, Math.round(Number(deadDays) || 30)));
    toastOk('تم حفظ مدة الرکود');
    buzz(10);
  }

  async function addCat() {
    const name = newCat.trim();
    if (!name) return;
    if (cats.includes(name)) { toastErr('التصنيف موجود مسبقاً'); return; }
    cats = [...cats, name];
    await setSetting('categories', cats);
    newCat = '';
    toastOk('أُضيف التصنيف');
    buzz(8);
  }
  async function rmCat(name) {
    if (DEFAULT_CATEGORIES.includes(name)) {
      const ok = await askConfirm({ title: 'حذف تصنيف أساسي؟', body: 'يمكنك إضافته لاحقاً في أي وقت.', okLabel: 'حذف', danger: true });
      if (!ok) return;
    }
    cats = cats.filter((c) => c !== name);
    await setSetting('categories', cats);
    toastOk('حُذف التصنيف');
  }

  /* WhatsApp template save / reset */
  function insertVar(token) {
    waText = (waText || '') + token;
    buzz(8);
  }
  async function saveWaTemplate() {
    if (!waText.trim()) { toastErr('الرسالة لا يمكن أن تكون فارغة'); return; }
    await setSetting('waTemplate', waText);
    waTouched = true;
    toastOk('تم حفظ رسالة الواتساب');
    buzz([14, 30, 14]);
  }
  async function resetWaTemplate() {
    const ok = await askConfirm({
      title: 'استعادة الرسالة الافتراضية؟',
      body: 'سيُستبدل النص الحالي بالرسالة الأصلية.',
      okLabel: 'استعادة'
    });
    if (!ok) return;
    waText = DEFAULT_WA_TEMPLATE;
    await setSetting('waTemplate', waText);
    waTouched = false;
    toastOk('أُعيدت الرسالة الافتراضية');
    buzz(10);
  }

  /* PIN change */
  let pinBox = $state(false);
  let p1 = $state('');
  let p2 = $state('');

  async function savePin() {
    if (!/^\d{4}$/.test(p1)) { toastErr('الرقم يجب أن يكون 4 أرقام'); return; }
    if (p1 !== p2) { toastErr('الرقمان غير متطابقين'); return; }
    await setSetting('pin', await hashPin(p1));
    p1 = ''; p2 = '';
    pinBox = false;
    toastOk('تم تغيير الرقم السري');
    buzz([20, 50, 20]);
  }
  async function removePin() {
    const ok = await askConfirm({ title: 'إزالة الرقم السري؟', body: 'سيعمل التطبيق بدون شاشة قفل.', okLabel: 'إزالة', danger: true });
    if (!ok) return;
    await setSetting('pin', null);
    toastOk('أُزيل الرقم السري');
  }

  /* Danger zone */
  async function demo() {
    const ok = await askConfirm({ title: 'إضافة بيانات تجريبية؟', body: '6 موديلات جاهزة للحصول على إحصاءات فورية.', okLabel: 'إضافة' });
    if (!ok) return;
    await seedDemo();
    toastOk('أُضيفت بيانات تجريبية');
  }
  async function wipe() {
    const ok = await askConfirm({ title: 'مسح كل البيانات؟', body: 'سيُحذف كل المخزون والمبيعات نهائياً. خذ نسخة احتياطية أولاً!', okLabel: 'مسح الكل', danger: true });
    if (!ok) return;
    await wipeAll();
    toastOk('تم مسح جميع البيانات');
  }
</script>

<div class="stack" style="gap:12px">
  {#if loaded}
    <Glass class="rise" style="padding:16px">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="truck" size={17} color="var(--burgundy)" /> التوصيل</h2>
      <div class="field">
        <label>أجور التوصيل (د.ع) — لكل المحافظات</label>
        <div class="row" style="gap:8px">
          <input class="input" bind:value={fee} inputmode="numeric" style="flex:1" />
          <button class="btn primary" onclick={saveFee}>حفظ</button>
        </div>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.05s">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="alert" size={17} color="var(--warn)" /> التنبيهات</h2>
      <div class="stack" style="gap:12px">
        <div class="field">
          <label>تنبيه عند وصول الكمية إلى (قطعة)</label>
          <div class="row" style="gap:8px">
            <input class="input" bind:value={low} inputmode="numeric" style="flex:1" />
            <button class="btn primary" onclick={saveLow}>حفظ</button>
          </div>
        </div>
        <div class="field">
          <label>اعتبر الموديل راكداً بعد (يوم) بلا بيع</label>
          <div class="row" style="gap:8px">
            <input class="input" bind:value={deadDays} inputmode="numeric" style="flex:1" />
            <button class="btn primary" onclick={saveDead}>حفظ</button>
          </div>
        </div>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.1s">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="tag" size={17} color="var(--burgundy)" /> التصنيفات</h2>
      <div class="row wrap" style="gap:8px; margin-bottom:12px">
        {#each cats as c (c)}
          <span class="chip on">
            {c}
            <button class="chip-x" onclick={() => rmCat(c)} aria-label="حذف {c}">
              <Icon name="x" size={12} color="#fff" />
            </button>
          </span>
        {/each}
      </div>
      <div class="row" style="gap:8px">
        <input class="input" bind:value={newCat} placeholder="تصنيف جديد…" style="flex:1" onkeydown={(e) => e.key === 'Enter' && addCat()} />
        <button class="btn" onclick={addCat}><Icon name="plus" size={16} /> إضافة</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.12s">
      <div class="row" style="justify-content:space-between; margin-bottom:12px">
        <h2 class="h2"><Icon name="whatsapp" size={17} /> رسالة الواتساب</h2>
        {#if waTouched}<span class="small muted">مُخصصة</span>{/if}
      </div>
      {#if waBox}
        <div class="stack" style="gap:10px">
          <div class="row wrap" style="gap:6px">
            {#each WA_VARS as v (v.token)}
              <button class="chip" onclick={() => insertVar(v.token)} title={v.label}>{v.token}</button>
            {/each}
          </div>
          <textarea class="input wa-ta" bind:value={waText} rows="9" dir="rtl"></textarea>
          <p class="muted small">اضغط على أي متغير لإضافته للنص — يتحول تلقائياً لبيانات كل عملية عند الإرسال.</p>
          <div class="row" style="gap:8px">
            <button class="btn ghost" style="flex:1" onclick={() => (waBox = false)}>إغلاق</button>
            <button class="btn" style="flex:1" onclick={resetWaTemplate}>الافتراضية</button>
            <button class="btn primary" style="flex:1" onclick={saveWaTemplate}>حفظ</button>
          </div>
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:10px">نص الرسالة الجاهزة التي تُرسل للزبون عند البيع — عدّلها كما تحب.</p>
        <button class="btn block" onclick={() => { waBox = true; buzz(8); }}>
          <Icon name="edit" size={16} /> تعديل نص الرسالة
        </button>
      {/if}
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.15s">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="lock" size={17} color="var(--burgundy)" /> الرقم السري</h2>
      {#if pinBox}
        <div class="stack" style="gap:10px">
          <input class="input" bind:value={p1} inputmode="numeric" maxlength="4" placeholder="الرقم الجديد (4 أرقام)" />
          <input class="input" bind:value={p2} inputmode="numeric" maxlength="4" placeholder="تأكيد الرقم" />
          <div class="row" style="gap:8px">
            <button class="btn ghost" style="flex:1" onclick={() => (pinBox = false)}>إلغاء</button>
            <button class="btn primary" style="flex:1" onclick={savePin}>حفظ</button>
          </div>
        </div>
      {:else}
        <div class="row" style="gap:8px">
          <button class="btn" style="flex:1" onclick={() => (pinBox = true)}>تغيير الرقم السري</button>
          <button class="btn danger" style="flex:1" onclick={removePin}>إزالة القفل</button>
        </div>
      {/if}
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.2s; border-color:rgba(181,73,91,0.3)">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="alert" size={17} color="var(--burgundy)" /> منطقة التجارب</h2>
      <div class="row" style="gap:8px">
        <button class="btn" style="flex:1" onclick={demo}>بيانات تجريبية</button>
        <button class="btn danger" style="flex:1" onclick={wipe}>مسح كل البيانات</button>
      </div>
    </Glass>
  {/if}
</div>

<style>
  .chip-x {
    background: rgba(255, 255, 255, 0.25);
    border: none;
    border-radius: 50%;
    width: 16px; height: 16px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .wa-ta {
    width: 100%;
    min-height: 170px;
    resize: vertical;
    line-height: 1.7;
    font-family: inherit;
  }
</style>
