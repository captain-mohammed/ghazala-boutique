<script>
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { screenIn } from './lib/motion.js';
  import Lock from './lib/components/Lock.svelte';
  import BottomNav from './lib/components/BottomNav.svelte';
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
  import LogoScreen from './lib/screens/LogoScreen.svelte';
  import DeliveryLedger from './lib/screens/DeliveryLedger.svelte';
  import Expenses from './lib/screens/Expenses.svelte';
  import Reservations from './lib/screens/Reservations.svelte';
  import PasteToSell from './lib/screens/PasteToSell.svelte';
  import Occasions from './lib/screens/Occasions.svelte';

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
    logo: 'شعار التطبيق',
    about: 'عن التطبيق',
    ledger: 'حساب شركات التوصيل',
    expenses: 'المصاريف',
    reservations: 'الحجوزات',
    pastesell: 'بيع من رسالة',
    occasions: 'المناسبات'
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
</script>

<div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>

{#if locked}
  <Lock onunlock={() => (locked = false)} />
{:else}
  <main class="app" in:fade={{ duration: 250 }}>
    {#key screen}
      <div class="screen" in:screenIn={{ x: slideX, y: 14, duration: 430 }}>
        {#if screen !== 'home'}
          <header class="head">
            <h1 class="h1">{SUBTITLES[screen] || ''}</h1>
          </header>
        {/if}
        {#if screen === 'home'}<Dashboard {goto} />
        {:else if screen === 'inventory'}<Inventory {goto} />
        {:else if screen === 'sell'}<Sell />
        {:else if screen === 'reports'}<Reports />
        {:else if screen === 'more'}<More {goto} />
        {:else if screen === 'saleslog'}<SalesLog />
        {:else if screen === 'stocktake'}<Stocktake />
        {:else if screen === 'settings'}<Settings />
        {:else if screen === 'backup'}<Backup />
        {:else if screen === 'logo'}<LogoScreen />
        {:else if screen === 'about'}<About />
        {:else if screen === 'ledger'}<DeliveryLedger />
        {:else if screen === 'expenses'}<Expenses />
        {:else if screen === 'reservations'}<Reservations />
        {:else if screen === 'pastesell'}<PasteToSell />
        {:else if screen === 'occasions'}<Occasions />
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
  .head { margin-bottom: 14px; }
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
