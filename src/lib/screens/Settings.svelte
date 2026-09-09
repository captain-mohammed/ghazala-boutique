<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, allSettings, setSetting, seedDemo, wipeAll } from '../db.js';
  import { fmtIQD, buzz, hashPin, iqd, WA_VARS, DEFAULT_WA_TEMPLATE, buildSalesMessage } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';
  import { applyTheme } from '../theme.js';

  let { goto = () => {} } = $props();

  let fee = $state('');
  let low = $state(3);
  let deadDays = $state(30);
  let loaded = $state(false);
  let themeMode = $state('light');

  /* WhatsApp message template */
  let waText = $state(DEFAULT_WA_TEMPLATE);
  let waTouched = $state(false);
  let waBox = $state(false);

  onMount(async () => {
    const s = await allSettings();
    fee = s.deliveryFee;
    low = s.lowStockThreshold;
    deadDays = s.deadStockDays;
    themeMode = s.theme || 'light';
    if (typeof s.waTemplate === 'string' && s.waTemplate.trim()) {
      waText = s.waTemplate;
      waTouched = true;
    }
    loaded = true;
  });

  const THEMES = [
    { id: 'light', label: 'فاتح', icon: 'sparkle' },
    { id: 'dark', label: 'ليلي', icon: 'moon' },
    { id: 'auto', label: 'تلقائي', icon: 'clock' }
  ];
  async function pickTheme(id) {
    themeMode = id;
    await setSetting('theme', id);
    applyTheme(id);
    buzz(10);
    toastOk(id === 'auto' ? 'تلقائي — يغلق بالليل بتوقيت بغداد' : id === 'dark' ? 'الوضع الليلي مفعّل' : 'الوضع النهاري مفعّل');
  }

  async function saveFee() {
    const v = iqd(fee);
    await setSetting('deliveryFee', v);
    fee = v;
    toastOk(`أجور التوصيل: ${fmtIQD(v)}`);
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
      <h2 class="h2" style="margin-bottom:6px"><Icon name="moon" size={17} color="var(--burgundy)" /> المظهر</h2>
      <p class="muted small" style="margin:0 0 12px">«تلقائي» يلبس غزالة نظارة الليل من 6 المغرب إلى 6 الصباح بتوقيت بغداد.</p>
      <div class="theme-seg">
        {#each THEMES as t (t.id)}
          <button type="button" class="th-btn" class:on={themeMode === t.id} onclick={() => pickTheme(t.id)}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        {/each}
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.05s">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="truck" size={17} color="var(--burgundy)" /> التوصيل</h2>
      <div class="field">
        <label>أجور التوصيل (د.ع) — لكل المحافظات <span class="muted tiny">— الآلاف: اكتب 5 = 5,000</span></label>
        <div class="row" style="gap:8px">
          <input class="input" bind:value={fee} inputmode="decimal" style="flex:1" />
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

    <Glass
      as="button"
      class="rise opt-link"
      style="animation-delay:0.1s"
      onclick={() => { buzz(8); goto('modelopts'); }}
    >
      <span class="ol-ic"><Icon name="sliders" size={18} color="#fff" /></span>
      <div style="flex:1; min-width:0; text-align:right">
        <div class="bold">خيارات الموديلات</div>
        <div class="muted small">التصنيفات، الأنواع، المواسم (شتائي/صيفي)، المواد، والألوان بدوائرها — كلها تُعدّل هنا</div>
      </div>
      <Icon name="back" size={17} color="var(--taupe)" />
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
  :global(.opt-link) {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; text-align: right; width: 100%; cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.opt-link:active) { transform: scale(0.98); }
  :global(.opt-link .ol-ic) {
    flex: none; width: 42px; height: 42px; border-radius: 13px;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(122, 46, 58, 0.25);
  }
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
  .theme-seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .th-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 46px;
    border-radius: 14px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.5);
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 800;
    color: var(--ink-2);
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, color 0.2s, border-color 0.2s;
  }
  .th-btn:active { transform: scale(0.95); }
  .th-btn.on {
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    border-color: rgba(255, 255, 255, 0.35);
    color: #fff;
    box-shadow: 0 4px 12px rgba(122, 46, 58, 0.25);
  }
</style>
