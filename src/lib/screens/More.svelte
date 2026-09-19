<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { buzz } from '../utils.js';

  let { goto } = $props();

  /* «متجري» في الأعلى وحده — بلا أي قسم فوقه: هو ملخص المتجر كله */
  const heroItem = {
    id: 'store',
    icon: 'store',
    label: 'متجري',
    desc: 'ملخص كل شيء — من أول سجل إلى اليوم: الأرباح والموديلات وآخر بيعة'
  };

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
      title: 'التسويق',
      items: [
        { id: 'broadcast', icon: 'sparkle', label: 'استوديو التسويق', desc: 'حملات واتساب لكل شريحة — قبل الجميع، الاشتقاق، إنقاذ الراكد، وقائمة الانتظار' },
        { id: 'studio', icon: 'image', label: 'استوديو القصص', desc: 'كل موديل يصير منشوراً وقصة وهاشتاغات جاهزة للنشر' }
      ]
    },
    {
      title: 'الزبونات',
      items: [
        { id: 'customers', icon: 'user', label: 'دفتر الزبونات', desc: 'كل زبونة بإجمالياتها وآخر زيارة وذكرياتها' },
        { id: 'reservations', icon: 'clock', label: 'الحجوزات', desc: 'قطع محجوزة لزبوناتك — تحويل لبيع بأمان' },
        { id: 'occasions', icon: 'calendar', label: 'المناسبات', desc: 'أعياد ميلاد وذكريات زبوناتك — ذكّرهم بوقتهم' }
      ]
    },
    {
      title: 'المال',
      items: [
        { id: 'suppliers', icon: 'upload', label: 'دفتر الموردين', desc: 'منين اشتريتِ — وكم بيع من كل مورد' },
        { id: 'ledger', icon: 'truck', label: 'حساب الشركات', desc: 'المبالغ عند شركات التوصيل والتسوية' },
        { id: 'expenses', icon: 'wallet', label: 'المصاريف', desc: 'الإيجار والنقل والتغليف — تُخصم من الربح' }
      ]
    },
    {
      title: 'التطبيق',
      items: [
        { id: 'modelopts', icon: 'sliders', label: 'خيارات الموديلات', desc: 'التصنيفات، الأنواع وتفصيلها، المواسم، المواد، والألوان' },
        { id: 'repair', icon: 'alert', label: 'إصلاح الموديلات', desc: 'فحص الموديلات التي اندمجت بطاقاتها خطأً — وافصليها بضغطة' },
        { id: 'settings', icon: 'settings', label: 'الإعدادات', desc: 'التوصيل، الرسائل، الرقم السري' },
        { id: 'backup', icon: 'shield', label: 'النسخ الاحتياطي', desc: 'حماية بياناتك — نسخة واستعادة' },
        { id: 'about', icon: 'info', label: 'عن التطبيق', desc: 'بوتيك غزالة ومعلومات النسخة' }
      ]
    }
  ];
</script>

<!-- «متجري» — أول شيء في الصفحة، بلا عنوان قسم فوقه -->
<div class="grp" style="animation-delay:0s">
  <Glass
    as="button"
    class="menu hero-menu rise"
    style="animation-delay:0.02s"
    onclick={() => { buzz(10); goto(heroItem.id); }}
  >
    <span class="m-top">
      <span class="m-ic"><Icon name={heroItem.icon} size={20} color="var(--burgundy)" /></span>
      <span class="m-label">{heroItem.label}</span>
    </span>
    <span class="m-desc muted small">{heroItem.desc}</span>
  </Glass>
</div>

{#each groups as g, gi (g.title)}
  <div class="grp" style="animation-delay:{(gi + 1) * 0.06}s">
    <div class="grp-title">{g.title}</div>
    {#each g.items as it, i (it.id)}
      <Glass
        as="button"
        class="menu rise"
        style="animation-delay:{0.05 + (gi + 1) * 0.06 + i * 0.04}s"
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
  /* «متجري» — أكبر وأبرز قليلاً من بقية الأدوات */
  :global(.hero-menu) {
    padding: 15px 16px;
    border-color: rgba(181, 73, 91, 0.3);
    background: linear-gradient(140deg, rgba(255, 255, 255, 0.72), rgba(181, 73, 91, 0.07));
  }
  :global(.hero-menu) .m-ic { width: 40px; height: 40px; border-radius: 13px; }
  :global(.hero-menu) .m-label { font-size: 16.5px; }
  :global(.hero-menu) .m-desc { padding-inline-start: 50px; }
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
