<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { screenIn } from './lib/motion.js';
  import Lock from './lib/components/Lock.svelte';
  import BottomNav from './lib/components/BottomNav.svelte';
  import BackBtn from './lib/components/BackBtn.svelte';
  import Dashboard from './lib/screens/Dashboard.svelte';
  import Inventory from './lib/screens/Inventory.svelte';
  import Sell from './lib/screens/Sell.svelte';
  import Reports from './lib/screens/Reports.svelte';
  import More from './lib/screens/More.svelte';
  import SalesLog from './lib/screens/SalesLog.svelte';
  import Stocktake from './lib/screens/Stocktake.svelte';
  import Settings from './lib/screens/Settings.svelte';
  import Backup from './lib/screens/Backup.svelte';
  import About from './lib/screens/About.svelte';
  import DeliveryLedger from './lib/screens/DeliveryLedger.svelte';
  import Suppliers from './lib/screens/Suppliers.svelte';
  import Customers from './lib/screens/Customers.svelte';
  import Expenses from './lib/screens/Expenses.svelte';
  import Reservations from './lib/screens/Reservations.svelte';
  import PasteToSell from './lib/screens/PasteToSell.svelte';
  import ReceiveInvoice from './lib/screens/ReceiveInvoice.svelte';
  import ModelOptions from './lib/screens/ModelOptions.svelte';
  import Occasions from './lib/screens/Occasions.svelte';
  import Broadcast from './lib/screens/Broadcast.svelte';
  import StoryStudio from './lib/screens/StoryStudio.svelte';
  import ModelRepair from './lib/screens/ModelRepair.svelte';
  import MyStore from './lib/screens/MyStore.svelte';
  import { sweepMonthClosing, backfillModelIds, backfillTypeTree, sweepOosModelWide, sweepSeasonArrays, migratePhotosToTable } from './lib/db.js';

  let locked = $state(true);
  let screen = $state('home');

  const NAV_TABS = [
    { id: 'home', label: 'الرئيسية', icon: 'home' },
    { id: 'inventory', label: 'المخزون', icon: 'box' },
    { id: 'sell', label: 'بيع', icon: 'cart' },
    { id: 'reports', label: 'تقارير', icon: 'chart' },
    { id: 'saleslog', label: 'السجل', icon: 'history' },
    { id: 'more', label: 'المزيد', icon: 'dots' }
  ];
  const MAIN_TABS = new Set(NAV_TABS.map((t) => t.id));
  /* sub-pages (كل ما يفتح من «المزيد») get the bespoke back button in their header */
  const isSub = (id) => id !== 'home' && !MAIN_TABS.has(id);
  /* screens with their own hero title — the header shows only the back button,
     otherwise the title appears twice (and customers/suppliers had an empty one) */
  const HERO_SCREENS = new Set(['suppliers', 'customers', 'broadcast', 'studio']);

  const SUBTITLES = {
    home: 'بوتيك غزالة',
    inventory: 'المخزون',
    sell: 'بيع سريع',
    reports: 'التقارير',
    more: 'المزيد',
    saleslog: 'سجل المبيعات',
    stocktake: 'الجرد',
    settings: 'الإعدادات',
    backup: 'النسخ الاحتياطي',
    about: 'عن التطبيق',
    ledger: 'حساب شركات التوصيل',
    expenses: 'المصاريف',
    reservations: 'الحجوزات',
    pastesell: 'بيع من رسالة',
    receive: 'فاتورة وارد',
    modelopts: 'خيارات الموديلات',
    occasions: 'المناسبات',
    broadcast: 'استوديو التسويق',
    studio: 'استوديو القصص',
    suppliers: 'دفتر الموردين',
    customers: 'دفتر الزبونات',
    repair: 'إصلاح الموديلات',
    store: 'متجري'
  };

  function goto(id) {
    if (screen === id) return;
    // position-aware: content slides in from the tapped tab's side
    const from = NAV_TABS.findIndex((t) => t.id === screen);
    const to = NAV_TABS.findIndex((t) => t.id === id);
    slideX = from !== -1 && to !== -1 ? (to > from ? 1 : -1) * 52 : 0;
    screen = id;
    window.scrollTo({ top: 0 });
  }
  let slideX = $state(0);

  /* PWA update prompt */
  let needRefresh = $state(false);
  let wbUpdate = null;

  onMount(async () => {
    sweepMonthClosing();
    backfillModelIds();
    backfillTypeTree();
    sweepOosModelWide();
    sweepSeasonArrays();
    /* صور الموديل: تُنسخ مرة واحدة من البطاقات إلى جدولها، فتصير كل جلبة
       بيانات خفيفة بدل أن تقرأ عشرات الميجابايت كل أربع ثوانٍ */
    migratePhotosToTable();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e;
    });
    try {
      const wb = await import('virtual:pwa-register');
      wbUpdate = await wb.registerSW({ immediate: true, onNeedRefresh: () => (needRefresh = true) });
    } catch {
      /* dev mode or SW not available */
    }
  });

  let deferredInstall = null;

  /* تعطيل ضبابية الزجاج أثناء التمرير يُبقي الحركة سلسة على الجوال:
     كل بطاقة زجاجية (blur 25px) تُعاد تركيبها في وحدة معالجة الرسوم كل إطار
     أثناء التمرير، فتبطء الانزلاق. نزيل الضبابية أثناء التمرير ونعيدها بعد توقفه
     بلمحة — المظهر الزجاجي يبقى كما هو عند الثبات. */
  $effect(() => {
    let t;
    const onScroll = () => {
      const root = document.documentElement;
      if (!root.classList.contains('is-scrolling')) root.classList.add('is-scrolling');
      clearTimeout(t);
      t = setTimeout(() => root.classList.remove('is-scrolling'), 140);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(t);
      document.documentElement.classList.remove('is-scrolling');
    };
  });
</script>

<div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>

{#if locked}
  <Lock onunlock={() => (locked = false)} />
{:else}
  <main class="app" in:fade={{ duration: 250 }}>
    {#key screen}
      <div class="screen" in:screenIn={{ x: slideX, y: 14, duration: 430 }}>
        {#if screen !== 'home'}
          <!-- رأس متمركز: العنوان بالمنتصف، وزر الرجوع عائم على الحافة -->
          <header class="head">
            {#if isSub(screen)}
              <div class="head-back"><BackBtn onback={() => goto('more')} /></div>
            {/if}
            {#if !HERO_SCREENS.has(screen)}
              <h1 class="h1">{SUBTITLES[screen] || ''}</h1>
            {/if}
          </header>
        {/if}
        {#if screen === 'home'}<Dashboard {goto} />
        {:else if screen === 'inventory'}<Inventory {goto} />
        {:else if screen === 'sell'}<Sell {goto} />
        {:else if screen === 'reports'}<Reports />
        {:else if screen === 'more'}<More {goto} />
        {:else if screen === 'saleslog'}<SalesLog />
        {:else if screen === 'stocktake'}<Stocktake />
        {:else if screen === 'settings'}<Settings {goto} />
        {:else if screen === 'backup'}<Backup />
        {:else if screen === 'about'}<About />
        {:else if screen === 'ledger'}<DeliveryLedger />
        {:else if screen === 'expenses'}<Expenses />
        {:else if screen === 'reservations'}<Reservations />
        {:else if screen === 'pastesell'}<PasteToSell />
        {:else if screen === 'receive'}<ReceiveInvoice {goto} />
        {:else if screen === 'modelopts'}<ModelOptions />
        {:else if screen === 'suppliers'}<Suppliers {goto} />
        {:else if screen === 'customers'}<Customers {goto} />
        {:else if screen === 'occasions'}<Occasions />
        {:else if screen === 'broadcast'}<Broadcast {goto} />
        {:else if screen === 'studio'}<StoryStudio />
        {:else if screen === 'repair'}<ModelRepair />
        {:else if screen === 'store'}<MyStore />
        {/if}
      </div>
    {/key}
  </main>

  <BottomNav
    tabs={NAV_TABS}
    active={MAIN_TABS.has(screen) ? screen : 'more'}
    onselect={goto}
    midAction={() => goto('sell')}
  />
{/if}

{#if needRefresh}
  <div class="update glass-strong">
    <span class="small bold">يتوفر تحديث جديد</span>
    <button class="btn primary" style="min-height:40px" onclick={() => wbUpdate?.(true)}>تحديث</button>
    <button class="iconbtn" aria-label="لاحقاً" onclick={() => (needRefresh = false)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
  </div>
{/if}

<style>
  .app {
    min-height: 100dvh;
    max-width: 560px;
    margin: 0 auto;
    padding: calc(14px + var(--sat)) 14px calc(var(--nav-h) + 40px + var(--sab));
  }
  .screen { min-height: 60dvh; }
  .head {
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: center; /* العنوان دائماً بمنتصف الصفحة */
    position: relative;
    min-height: 42px;
  }
  .head-back {
    position: absolute;
    inset-inline-start: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
  }
  .update {
    position: fixed;
    top: calc(12px + var(--sat));
    left: 12px;
    right: 12px;
    max-width: 400px;
    margin: 0 auto;
    z-index: 85;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 18px;
  }
  .update .small { flex: 1; }
</style>
