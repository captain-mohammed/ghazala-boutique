<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { buzz } from '../utils.js';

  let { goto } = $props();

  /* الأدوات مجمعة بحسب عملها — كل قسم بعنوانه */
  const groups = [
    {
      title: 'البيع والمخزون',
      items: [
        { id: 'receive', icon: 'upload', label: 'فاتورة وارد', desc: 'استلام عدة موديلات ومقاسات بضغطة — مع اسم المورد' },
        { id: 'pastesell', icon: 'cart', label: 'بيع من رسالة', desc: 'الصق رسالة الزبونة — يطابق الموديلات تلقائياً' },
        { id: 'stocktake', icon: 'check', label: 'الجرد', desc: 'مطابقة الكميات مع الرفوف' }
      ]
    },
    {
      title: 'الزبونات',
      items: [
        { id: 'reservations', icon: 'clock', label: 'الحجوزات', desc: 'قطع محجوزة لزبوناتك — تحويل لبيع بأمان' },
        { id: 'occasions', icon: 'calendar', label: 'المناسبات', desc: 'أعياد ميلاد وذكريات زبوناتك — ذكّرهم بوقتهم' }
      ]
    },
    {
      title: 'المال',
      items: [
        { id: 'ledger', icon: 'truck', label: 'حساب الشركات', desc: 'المبالغ عند شركات التوصيل والتسوية' },
        { id: 'expenses', icon: 'wallet', label: 'المصاريف', desc: 'الإيجار والنقل والتغليف — تُخصم من الربح' }
      ]
    },
    {
      title: 'التطبيق',
      items: [
        { id: 'modelopts', icon: 'sliders', label: 'خيارات الموديلات', desc: 'التصنيفات، الأنواع وتفصيلها، المواسم، المواد، والألوان' },
        { id: 'settings', icon: 'settings', label: 'الإعدادات', desc: 'التوصيل، المزاج، الرسائل، الرقم السري' },
        { id: 'backup', icon: 'shield', label: 'النسخ الاحتياطي', desc: 'حماية بياناتك — نسخة واستعادة' },
        { id: 'about', icon: 'info', label: 'عن التطبيق', desc: 'بوتيك غزالة ومعلومات النسخة' }
      ]
    }
  ];
</script>

{#each groups as g, gi (g.title)}
  <div class="grp" style="animation-delay:{gi * 0.06}s">
    <div class="grp-title">{g.title}</div>
    {#each g.items as it, i (it.id)}
      <Glass
        as="button"
        class="menu rise"
        style="animation-delay:{0.05 + gi * 0.06 + i * 0.04}s"
        onclick={() => { buzz(8); goto(it.id); }}
      >
        <span class="m-top">
          <span class="m-ic"><Icon name={it.icon} size={18} color="var(--burgundy)" /></span>
          <span class="m-label">{it.label}</span>
        </span>
        <span class="m-desc muted small">{it.desc}</span>
      </Glass>
    {/each}
  </div>
{/each}

<style>
  :global(.menu) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 13px 15px;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.menu:active) { transform: scale(0.98); }
  .m-top { display: flex; align-items: center; gap: 10px; }
  .m-ic {
    flex: none;
    width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 11px;
    background: var(--accent-soft);
  }
  .m-label { font-weight: 800; font-size: 15px; color: var(--ink); }
  .m-desc { padding-inline-start: 44px; }
  .grp { display: flex; flex-direction: column; gap: 10px; animation: grp-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
  @keyframes grp-in {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .grp-title {
    padding: 6px 4px 0;
    font-size: 15px;
    font-weight: 900;
    color: var(--ink);
    letter-spacing: 0.3px;
  }
</style>
