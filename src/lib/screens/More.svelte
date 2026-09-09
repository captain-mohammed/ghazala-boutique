<script>
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import { buzz } from '../utils.js';

  let { goto } = $props();

  const items = [
    { id: 'pastesell', icon: 'cart', label: 'بيع من رسالة', desc: 'الصق رسالة الزبونة — يطابق الموديلات تلقائياً' },
    { id: 'reservations', icon: 'clock', label: 'الحجوزات', desc: 'قطع محجوزة لزبوناتك — تحويل لبيع بأمان' },
    { id: 'ledger', icon: 'truck', label: 'حساب الشركات', desc: 'المبالغ عند شركات التوصيل والتسوية' },
    { id: 'expenses', icon: 'wallet', label: 'المصاريف', desc: 'الإيجار والنقل والتغليف — تُخصم من الربح' },
    { id: 'stocktake', icon: 'check', label: 'الجرد', desc: 'مطابقة الكميات مع الرفوف' },
    { id: 'logo', icon: 'sparkle', label: 'شعار التطبيق', desc: 'تغيير شعار بوتيك غزالة أو استعادة الافتراضي' },
    { id: 'settings', icon: 'settings', label: 'الإعدادات', desc: 'التوصيل، التنبيهات، الرقم السري' },
    { id: 'backup', icon: 'shield', label: 'النسخ الاحتياطي', desc: 'حماية بياناتك — نسخة واستعادة' },
    { id: 'about', icon: 'info', label: 'عن التطبيق', desc: 'بوتيك غزالة ومعلومات النسخة' }
  ];
</script>

<div class="stack" style="gap:12px">
  <section class="glass brand rise">
    <Logo size={54} />
    <div>
      <div class="bold">بوتيك غزالة</div>
      <div class="muted small">أناقة تمشي بخطى واثقة</div>
    </div>
  </section>

  <div class="stack" style="gap:10px">
    {#each items as it, i (it.id)}
      <button class="menu glass rise" style="animation-delay:{0.05 + i * 0.05}s" onclick={() => { buzz(8); goto(it.id); }}>
        <span class="m-ic"><Icon name={it.icon} size={20} color="var(--burgundy)" /></span>
        <div class="a-body">
          <div class="bold">{it.label}</div>
          <div class="muted small">{it.desc}</div>
        </div>
        <Icon name="back" size={17} color="var(--taupe)" />
      </button>
    {/each}
  </div>
</div>

<style>
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
  }
  .logo {
    width: 54px; height: 54px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
    color: var(--ivory);
    font-size: 30px;
    box-shadow: 0 8px 20px rgba(122, 46, 58, 0.28), inset 0 2px 8px rgba(255, 255, 255, 0.25);
  }
  .menu {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .menu:active { transform: scale(0.98); }
  .m-ic {
    flex: none;
    width: 42px; height: 42px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
    background: var(--accent-soft);
  }
  .a-body { flex: 1; display: flex; flex-direction: column; gap: 1px; }
</style>
