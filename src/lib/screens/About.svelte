<script>
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import Glass from '../components/Glass.svelte';

  const APP_VERSION = __APP_VERSION__; // auto-synced from package.json at build
</script>

<div class="stack" style="gap:12px">
  <Glass class="rise" style="padding:26px 20px; display:flex; flex-direction:column; align-items:center; gap:8px">
    <div class="floaty"><Logo size={84} /></div>
    <div class="wordmark">GHAZALA BOUTIQUE</div>
    <div class="tagline">بوتيك غزالة</div>
    <hr class="divider-gold" style="width:160px" />
    <div class="muted small center">أناقة تمشي بخطى واثقة</div>
  </Glass>

  <Glass class="rise" style="padding:16px; animation-delay:0.05s">
    <h2 class="h2" style="margin-bottom:10px"><Icon name="info" size={17} color="var(--burgundy)" /> عن التطبيق</h2>
    <div class="stack" style="gap:8px">
      <div class="row" style="justify-content:space-between"><span class="muted small">الإصدار</span><span class="bold small">{APP_VERSION}</span></div>
      <div class="row" style="justify-content:space-between"><span class="muted small">يعمل</span><span class="bold small">بدون إنترنت 100%</span></div>
      <div class="row" style="justify-content:space-between"><span class="muted small">البيانات</span><span class="bold small">محفوظة في جهازك فقط</span></div>
      <div class="row" style="justify-content:space-between"><span class="muted small">العملة</span><span class="bold small">دينار عراقي (د.ع)</span></div>
    </div>
  </Glass>

  <Glass class="rise" style="padding:16px; animation-delay:0.1s">
    <h2 class="h2" style="margin-bottom:10px"><Icon name="download" size={17} color="var(--gold)" /> تثبيت على الهاتف</h2>
    <ol class="muted small" style="margin:0; padding-right:18px; line-height:2">
      <li>افتحي الرابط في متصفح Chrome على هاتفك</li>
      <li>اضغطي قائمة Chrome ⋮ ثم «إضافة إلى الشاشة الرئيسية»</li>
      <li>سيظهر التطبيق بأيقونة بوتيك غزالة كأي تطبيق آخر</li>
    </ol>
  </Glass>

  <p class="muted small center" style="margin:4px 0 0">صُنع بحُب لبوتيك غزالة 💛</p>
</div>

<style>
  .wordmark { font-size: 15px; font-weight: 800; letter-spacing: 4px; color: var(--ink); }
  .tagline { font-size: 14px; font-weight: 700; color: var(--burgundy); }
</style>
