<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { db, allSettings, setSetting, seedDemo, wipeAll } from '../db.js';
  import { buzz, hashPin, WA_VARS, WA_STATUS_TEMPLATES } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  let { goto = () => {} } = $props();

  let deadDays = $state(30);
  let dailyTarget = $state(0);
  let vaultGoal = $state(500000);
  let archiveDays = $state(30);
  let suppliers = $state([]);
  let newSup = $state('');
  let loaded = $state(false);

  /* WhatsApp templates — قالب لكل حالة (قيد التوصيل / تم التسليم / راجع) */
  const WA_STATUSES = Object.entries(WA_STATUS_TEMPLATES).map(([id, t]) => ({ id, ...t }));
  let waStatus = $state('pending');
  let waText = $state('');
  let waTouched = $state(false);
  let waBox = $state(false);

  const waCurrent = $derived(WA_STATUSES.find((s) => s.id === waStatus) || WA_STATUSES[0]);

  onMount(async () => {
    const s = await allSettings();
    deadDays = s.deadStockDays;
    dailyTarget = s.dailyTarget ?? 0;
    vaultGoal = s.vaultGoal ?? 500000;
    archiveDays = s.archiveDays ?? 30;
    suppliers = Array.isArray(s.suppliers) ? s.suppliers : [];
    waText = s[waCurrent.key] || waCurrent.def;
    waTouched = !!s[waCurrent.key];
    loaded = true;
  });

  /* تبديل حالة القالب — النص والافتراضي يتبعانها */
  async function switchWaStatus(id) {
    waStatus = id;
    buzz(6);
    await loadWa();
  }
  async function loadWa() {
    const s = await allSettings();
    waText = s[waCurrent.key] || waCurrent.def;
    waTouched = !!s[waCurrent.key];
  }

  async function saveDead() {
    await setSetting('deadStockDays', Math.max(1, Math.round(Number(deadDays) || 30)));
    toastOk('تم حفظ مدة الرکود');
    buzz(10);
  }
  async function saveTargets() {
    await setSetting('dailyTarget', Math.max(0, Math.round(Number(dailyTarget) || 0)));
    await setSetting('vaultGoal', Math.max(0, Math.round(Number(vaultGoal) || 0)));
    await setSetting('archiveDays', Math.max(1, Math.round(Number(archiveDays) || 30)));
    toastOk('تم حفظ الأهداف');
    buzz([12, 30, 12]);
  }
  /* الموردون — سجل يظهر كقائمة منسدلة في فاتورة الوارد ونموذج الموديل */
  async function addSupplier() {
    const name = String(newSup || '').trim();
    if (!name) return;
    if (suppliers.includes(name)) { toastErr('المورد موجود مسبقاً'); return; }
    suppliers = [...suppliers, name];
    await setSetting('suppliers', [...suppliers]);
    newSup = '';
    toastOk('أُضيف المورد');
    buzz(8);
  }
  async function rmSupplier(name) {
    suppliers = suppliers.filter((x) => x !== name);
    await setSetting('suppliers', [...suppliers]);
    toastOk('حُذف المورد من السجل');
    buzz(6);
  }

  /* WhatsApp template save / reset — على مفتاح الحالة المختارة */
  function insertVar(token) {
    waText = (waText || '') + token;
    buzz(8);
  }
  async function saveWaTemplate() {
    if (!waText.trim()) { toastErr('الرسالة لا يمكن أن تكون فارغة'); return; }
    await setSetting(waCurrent.key, waText);
    waTouched = true;
    toastOk(`تم حفظ رسالة «${waCurrent.label}»`);
    buzz([14, 30, 14]);
  }
  async function resetWaTemplate() {
    const ok = await askConfirm({
      title: 'استعادة الرسالة الافتراضية؟',
      body: `سيُستبدل نص رسالة «${waCurrent.label}» بالرسالة الأصلية.`,
      okLabel: 'استعادة'
    });
    if (!ok) return;
    waText = waCurrent.def;
    await setSetting(waCurrent.key, waText);
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
    const ok = await askConfirm({ title: 'مسح كل البيانات؟', body: 'سيُحذف كل المخزون والمبيعات نهائياً. خذي نسخة احتياطية أولاً!', okLabel: 'مسح الكل', danger: true });
    if (!ok) return;
    await wipeAll();
    toastOk('تم مسح جميع البيانات');
  }
</script>

<div class="stack" style="gap:12px">
  {#if loaded}
    <Glass class="rise" style="padding:16px; animation-delay:0.05s">
      <h2 class="h2" style="margin-bottom:12px"><Icon name="alert" size={17} color="var(--warn)" /> التنبيهات</h2>
      <div class="stack" style="gap:12px">
        <div class="field">
          <label>اعتبر الموديل راكداً بعد (يوم) من آخر استلام أو بيع</label>
          <div class="row" style="gap:8px">
            <input class="input" bind:value={deadDays} inputmode="numeric" style="flex:1" />
            <button class="btn primary" onclick={saveDead}>حفظ</button>
          </div>
        </div>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.07s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="flag" size={17} color="var(--gold)" /> الأهداف والخزنة</h2>
      <p class="muted small" style="margin:0 0 12px">هدف يومي يشتغل حلقة ذهبية في الرئيسية، وهدف الخزنة يحتفل عندما تكتمل — و«المدينة القديمة» تجمع الموديلات النافدة بعد هذه المدة.</p>
      <div class="stack" style="gap:12px">
        <div class="field">
          <label>هدف القطع اليومي (0 = مطفي)</label>
          <input class="input" bind:value={dailyTarget} inputmode="numeric" />
        </div>
        <div class="field">
          <label>هدف الخزنة (د.ع)</label>
          <input class="input" bind:value={vaultGoal} inputmode="numeric" />
        </div>
        <div class="field">
          <label>انقل الموديل للمدينة القديمة بعد نفاد (يوم)</label>
          <input class="input" bind:value={archiveDays} inputmode="numeric" />
        </div>
        <button class="btn primary block" onclick={saveTargets}>حفظ الأهداف</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.12s">
      <div class="row" style="justify-content:space-between; margin-bottom:12px">
        <h2 class="h2"><Icon name="whatsapp" size={17} /> رسالة الواتساب</h2>
        {#if waTouched}<span class="small muted">مُخصصة</span>{/if}
      </div>
      <!-- قالب لكل حالة — الشريط يبدّل بينها -->
      <div class="row wrap" style="gap:6px; margin-bottom:10px">
        {#each WA_STATUSES as st (st.id)}
          <button type="button" class="chip" class:on={waStatus === st.id} onclick={() => switchWaStatus(st.id)}>{st.label}</button>
        {/each}
      </div>
      {#if waBox}
        <div class="stack" style="gap:10px">
          <div class="row wrap" style="gap:6px">
            {#each WA_VARS as v (v.token)}
              <button class="chip" onclick={() => insertVar(v.token)} title={v.label}>{v.token}</button>
            {/each}
          </div>
          <textarea class="input wa-ta" bind:value={waText} rows="9" dir="rtl"></textarea>
          <p class="muted small">اضغطي على أي متغير لإضافته للنص — يتحول تلقائياً لبيانات كل عملية عند الإرسال.</p>
          <div class="row" style="gap:8px">
            <button class="btn ghost" style="flex:1" onclick={() => (waBox = false)}>إغلاق</button>
            <button class="btn" style="flex:1" onclick={resetWaTemplate}>الافتراضية</button>
            <button class="btn primary" style="flex:1" onclick={saveWaTemplate}>حفظ</button>
          </div>
        </div>
      {:else}
        <p class="muted small" style="margin-bottom:10px">نص الرسالة الجاهزة التي تُرسل للزبون عند البيع — عدّليه كما تحبين.</p>
        <button class="btn block" onclick={() => { waBox = true; buzz(8); }}>
          <Icon name="edit" size={16} /> تعديل نص الرسالة
        </button>
      {/if}
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.14s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="upload" size={17} color="var(--gold)" /> الموردون</h2>
      <p class="muted small" style="margin:0 0 10px">سجل مورديك هنا — يظهرون قائمة منسدلة في فاتورة الوارد ونموذج الموديل، فتُسجَّل كل قطعة باسم من جاءت منه.</p>
      <div class="stack" style="gap:10px">
        <div class="row" style="gap:8px">
          <input class="input" bind:value={newSup} placeholder="اسم المورد… مثال: هاي مول - أبو علي" onkeydown={(e) => { if (e.key === 'Enter') addSupplier(); }} />
          <button class="btn primary" style="flex:none" onclick={addSupplier}><Icon name="plus" size={15} /> إضافة</button>
        </div>
        {#if suppliers.length}
          <div class="row wrap" style="gap:6px">
            {#each suppliers as s (s)}
              <span class="chip on">
                {s}
                <button class="chip-x" aria-label="حذف {s}" onclick={() => rmSupplier(s)}><Icon name="x" size={11} /></button>
              </span>
            {/each}
          </div>
        {:else}
          <p class="muted tiny">لا موردين بعد — أضيفي أول اسم وستظهر في القوائم فوراً.</p>
        {/if}
      </div>
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
      <h2 class="h2" style="margin-bottom:12px"><Icon name="alert" size={17} color="var(--burgundy)" /> منطقة الخطر</h2>
      <div class="row" style="gap:8px">
        <button class="btn" style="flex:1" onclick={demo}>بيانات تجريبية</button>
        <button class="btn danger" style="flex:1" onclick={wipe}>مسح كل البيانات</button>
      </div>
    </Glass>
  {/if}
</div>

<style>
  .wa-ta {
    width: 100%;
    min-height: 170px;
    resize: vertical;
    line-height: 1.7;
    font-family: inherit;
  }
</style>
