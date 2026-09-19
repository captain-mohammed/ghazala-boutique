<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import Pick from '../components/Pick.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db, addOccasion, deleteOccasion, upcomingOccasions, loadProducts } from '../db.js';
  import { fmtNum, buzz, sendWhatsApp } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let occasions = $state([]); // upcoming (already sorted, with inDays)
  let later = $state([]); // the rest
  let formOpen = $state(false);
  let editing = $state(null);

  /* form fields */
  let fName = $state('');
  let fPhone = $state('');
  let fLabel = $state('عيد ميلاد');
  let fMonth = $state(1);
  let fDay = $state(1);
  let fNote = $state('');

  const LABELS = ['عيد ميلاد', 'ذكرى زواج', 'مناسبة خاصة'];
  const MONTHS = ['كانون2/يناير', 'شباط/فبراير', 'آذار/مارس', 'نيسان/أبريل', 'أيار/مايو', 'حزيران/يونيو', 'تموز/يوليو', 'آب/أغسطس', 'أيلول/سبتمبر', 'تشرين1/أكتوبر', 'تشرين2/نوفمبر', 'كانون1/ديسمبر'];
  const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  let refresh = () => {};
  $effect(() => {
    let alive = true;
    const grab = async () => {
      const all = await db.occasions.toArray();
      if (!alive) return;
      const withDays = all.map((o) => ({ ...o, inDays: daysUntilLocal(o.month, o.day) }));
      withDays.sort((a, b) => a.inDays - b.inDays);
      occasions = withDays.filter((o) => o.inDays <= 30);
      later = withDays.filter((o) => o.inDays > 30);
    };
    refresh = grab;
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  function daysUntilLocal(month, day) {
    const now = new Date();
    const y = now.getFullYear();
    let next = new Date(y, month - 1, day);
    const today = new Date(y, now.getMonth(), now.getDate());
    if (next < today) next = new Date(y + 1, month - 1, day);
    return Math.round((next - today) / 86400000);
  }

  function whenLabel(o) {
    if (o.inDays === 0) return 'اليوم 🎉';
    if (o.inDays === 1) return 'بكرة';
    return `بعد ${fmtNum(o.inDays)} يوم`;
  }

  function openAdd() {
    editing = null;
    fName = ''; fPhone = ''; fLabel = 'عيد ميلاد';
    fMonth = new Date().getMonth() + 1; fDay = new Date().getDate();
    fNote = '';
    formOpen = true;
  }

  function openEdit(o) {
    editing = o;
    fName = o.customerName; fPhone = o.customerPhone || '';
    fLabel = o.label; fMonth = o.month; fDay = o.day; fNote = o.note || '';
    formOpen = true;
  }

  async function save() {
    if (!fName.trim()) { toastErr('اكتب اسم الزبونة'); return; }
    const maxDay = DAYS_IN[fMonth - 1] ?? 31;
    if (fDay < 1 || fDay > maxDay) { toastErr('اليوم غير صالح لهذا الشهر'); return; }
    try {
      if (editing) {
        await db.occasions.update(editing.id, {
          customerName: fName.trim(), customerPhone: fPhone.trim(), label: fLabel,
          month: Number(fMonth), day: Number(fDay), note: fNote.trim()
        });
        toastOk('تم تحديث المناسبة');
      } else {
        await addOccasion({ customerName: fName.trim(), customerPhone: fPhone.trim(), label: fLabel, month: fMonth, day: fDay, note: fNote.trim() });
        buzz([14, 30, 14]);
        toastOk('أُضيفت المناسبة — ستظهر في التذكيرات');
      }
      formOpen = false;
      refresh();
    } catch (e) {
      console.error(e);
      toastErr('تعذر الحفظ');
    }
  }

  async function remove(o) {
    const ok = await askConfirm({
      title: `حذف مناسبة ${o.customerName}؟`,
      body: 'لن يظهر لها تذكير بعد الآن.',
      okLabel: 'حذف',
      danger: true
    });
    if (!ok) return;
    await deleteOccasion(o.id);
    buzz(10);
    refresh();
  }

  /* greeting via WhatsApp — prefilled message, customer's number if known */
  async function greet(o) {
    const msg =
      o.label === 'ذكرى زواج'
        ? `ألف مبروك ذكرى زواجكم سنة حلوة 🌹 — من بوتيك غزالة، عيالها الغالية 💌`
        : o.label === 'عيد ميلاد'
          ? `كل سنة وأنتِ سالمة حبيبتي 🎂🎈 — عيد ميلاد سعيد من بوتيك غزالة، وعلى المناسبة خصيصالك الخاصة عندنا 💛`
          : `كل عام وأنتِ بخير 🌸 — من بوتيك غزالة بمناسبة ${o.label}، همسة: عندنا جديد يليق بالمناسبة 💛`;
    const { opened, copied } = await sendWhatsApp(msg, o.customerPhone || '');
    buzz([14, 30, 14]);
    if (opened) toastOk('فُتح واتساب بتهنئة جاهزة 🎉');
    else if (copied) toastOk('نُسخت التهنئة — الصقيها في واتساب');
  }

  function rowTone(o) {
    if (o.inDays === 0) return 'gold';
    if (o.inDays <= 7) return 'soon';
    return 'calm';
  }

  /* ---------- عدّاد المناسبات الحي ----------
     كل مناسبة قريبة (٧ أيام) تشتغل فيها حلقة عدّ تنازلي حية — كل ثانية
     تُحدث أيام:ساعات:دقائق:ثواني، وتتصاعد نغمتها كلما اقترب اليوم. */
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const liveParts = (o) => {
    const y = new Date().getFullYear();
    let next = new Date(y, o.month - 1, o.day);
    if (next < new Date(y, new Date().getMonth(), new Date().getDate())) next = new Date(y + 1, o.month - 1, o.day);
    next.setHours(9, 0, 0, 0); /* مناسبات المحل تصبح صباح اليوم */
    let ms = next.getTime() - now;
    if (ms < 0) ms = 0;
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return [
      { v: String(d), l: 'يوم' },
      { v: pad(h), l: 'ساعة' },
      { v: pad(m), l: 'دقيقة' },
      { v: pad(s), l: 'ثانية' }
    ];
  };
  const liveOcc = $derived(occasions.filter((o) => o.inDays <= 7).slice(0, 2));
  const liveNow = $derived(liveOcc.map((o) => liveParts(o)));

  /* اختيار غزالة: ٣ موديلات على الرف تناسب المناسبة — يظهر تحت العدّاد */
  let picks = $state([]);
  let picksFor = $state('');
  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [prods, sales] = await Promise.all([loadProducts(), db.sales.toArray()]);
      if (!alive) return;
      const models = new Map();
      for (const p of prods) {
        if (!models.has(p.modelId)) models.set(p.modelId, { modelId: p.modelId, chain: '', photo: null, price: 0, qty: 0 });
        const m = models.get(p.modelId);
        const chain = [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ');
        if (chain && !m.chain) m.chain = chain;
        if (p.photo && !m.photo) m.photo = p.photo;
        if (p.price > m.price) m.price = p.price;
        m.qty += p.qty || 0;
      }
      const shelf = [...models.values()].filter((m) => m.qty > 0);
      /* الترتيب: الأحدث وصولاً أولاً — الجديد يليق بالمناسبات */
      const byNew = [...shelf].sort((a, b) => {
        const na = Math.max(...prods.filter((p) => p.modelId === a.modelId).map((p) => new Date(p.createdAt).getTime()));
        const nb = Math.max(...prods.filter((p) => p.modelId === b.modelId).map((p) => new Date(p.createdAt).getTime()));
        return nb - na;
      }).slice(0, 3);
      picksFor = shelf.length ? '' : 'empty';
      picks = byNew;
    };
    grab();
    const t = setInterval(grab, 8000);
    return () => { alive = false; clearInterval(t); };
  });
</script>

<div class="stack" style="gap:12px">
  <button class="btn gold block" onclick={() => { buzz(8); openAdd(); }}>
    <Icon name="calendar" size={18} /> إضافة مناسبة
  </button>

  {#if liveOcc.length}
    <div class="stack" style="gap:10px">
      {#each liveOcc as o, oi (o.id)}
        <Glass class="live rise {o.inDays === 0 ? 'today' : ''}" style="animation-delay:{oi * 0.06}s; padding:14px">
          <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:10px">
            <div class="row" style="gap:7px; align-items:center">
              <span class="live-ic">{o.label === 'عيد ميلاد' ? '🎂' : o.label === 'ذكرى زواج' ? '💍' : '🎉'}</span>
              <div>
                <div class="bold small">{o.label} {o.customerName}</div>
                <div class="muted tiny">{whenLabel(o)}</div>
              </div>
            </div>
            <span class="live-dot" class:hot={o.inDays === 0}></span>
          </div>
          <div class="count" class:hot={o.inDays === 0} aria-label="العد التنازلي">
            {#each liveNow[oi] as part, pi (part.l)}
              <div class="c-unit" style="animation-delay:{pi * 0.07}s">
                <b>{part.v}</b>
                <span>{part.l}</span>
              </div>
            {/each}
          </div>
          {#if picks.length}
            <div class="muted tiny" style="margin:10px 0 6px">اختيار غزالة للمناسبة:</div>
            <div class="pick-strip">
              {#each picks as m (m.modelId)}
                <div class="pick-t">
                  {#if m.photo}<img src={m.photo} alt="" loading="lazy" />{:else}<span class="noimg"><Icon name="image" size={16} color="var(--taupe)" /></span>{/if}
                  <span class="p-price">{fmtNum(m.price / 1000)}K</span>
                </div>
              {/each}
            </div>
          {/if}
        </Glass>
      {/each}
    </div>
  {/if}

  {#if occasions.length === 0 && later.length === 0}
    <EmptyState
      title="لا مناسبات محفوظة"
      subtitle="أعياد ميلاد زبوناتك وذكرياتهن — ذكّرهم قبل الوقت وفزّ قلبهم"
      icon="calendar"
    />
  {:else}
    {#if occasions.length}
      <div class="stack" style="gap:8px">
        {#each occasions as o, i (o.id)}
          <Glass class="orow rise {rowTone(o)}" style="animation-delay:{Math.min(i * 0.04, 0.25)}s">
            <button class="o-main" onclick={() => { buzz(6); openEdit(o); }}>
              <span class="o-ic {rowTone(o)}">
                <Icon name={o.label === 'ذكرى زواج' ? 'sparkle' : o.label === 'عيد ميلاد' ? 'flame' : 'calendar'} size={17} color="#fff" />
              </span>
              <div class="a-body">
                <div class="bold small">{o.customerName}</div>
                <div class="muted tiny">{o.label}{o.note ? ' - ' + o.note : ''}</div>
              </div>
            </button>
            <span class="o-when {rowTone(o)}">{whenLabel(o)}</span>
            <button class="o-wa" aria-label="تهنئة واتساب" onclick={() => greet(o)}>
              <Icon name="whatsapp" size={16} />
            </button>
            <button class="o-x" aria-label="حذف" onclick={() => remove(o)}>
              <Icon name="x" size={12} />
            </button>
          </Glass>
        {/each}
      </div>
    {/if}

    {#if later.length}
      <Glass class="later rise" style="animation-delay:0.15s">
        <div class="bold small" style="margin-bottom:8px">لاحقاً ({fmtNum(later.length)})</div>
        <div class="stack" style="gap:6px">
          {#each later as o (o.id)}
            <div class="l-row">
              <span class="bold small">{o.customerName}</span>
              <span class="muted tiny">{o.label}</span>
              <span class="muted tiny">{MONTHS[o.month - 1]} {fmtNum(o.day)}</span>
              <button class="o-x" aria-label="حذف" onclick={() => remove(o)}><Icon name="x" size={11} /></button>
            </div>
          {/each}
        </div>
      </Glass>
    {/if}
  {/if}
</div>

<Sheet open={formOpen} title={editing ? 'تعديل مناسبة' : 'مناسبة جديدة'} onclose={() => (formOpen = false)}>
  <div class="stack" style="gap:12px">
    <div class="field">
      <label>اسم الزبونة</label>
      <input class="input" bind:value={fName} placeholder="مثال: زينب" />
    </div>
    <div class="field">
      <label>الهاتف (اختياري — للتهنئة المباشرة)</label>
      <input class="input" bind:value={fPhone} inputmode="tel" placeholder="07xx…" />
    </div>
    <div class="field">
      <label>المناسبة</label>
      <div class="row wrap" style="gap:6px">
        {#each LABELS as l (l)}
          <button type="button" class="chip" class:on={fLabel === l} onclick={() => { fLabel = l; buzz(5); }}>{l}</button>
        {/each}
      </div>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>الشهر</label>
        <Pick
          bind:value={fMonth}
          options={MONTHS.map((m, i) => ({ v: i + 1, l: m }))}
          valOf={(o) => o.v}
          labelOf={(o) => o.l}
        />
      </div>
      <div class="field" style="flex:1">
        <label>اليوم</label>
        <input class="input" type="number" min="1" max="31" bind:value={fDay} />
      </div>
    </div>
    <div class="field">
      <label>ملاحظة (اختياري)</label>
      <input class="input" bind:value={fNote} placeholder="مثال: تحب الكعب العالي…" />
    </div>
    <button class="btn primary lg block" onclick={save}>
      <Icon name="check" size={20} /> {editing ? 'حفظ التعديلات' : 'إضافة المناسبة'}
    </button>
  </div>
</Sheet>

<style>
  /* عدّاد المناسبات الحي */
  .live { border-inline-start: 3px solid var(--gold); }
  .live.today { border-inline-start-color: var(--burgundy); }
  .live-ic { font-size: 22px; }
  .live-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--gold); flex: none; animation: pulse 1.6s ease-in-out infinite; }
  .live-dot.hot { background: var(--burgundy); animation-duration: 0.8s; }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.6); opacity: 0.45; }
  }
  .count { display: flex; gap: 7px; justify-content: center; }
  .c-unit {
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line-2);
    border-radius: 10px;
    padding: 6px 10px;
    min-width: 52px;
    animation: c-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  }
  .c-unit b { font-size: 19px; font-variant-numeric: tabular-nums; color: var(--ink); }
  .c-unit span { font-size: 9px; color: var(--taupe); font-weight: 700; }
  @keyframes c-in {
    from { opacity: 0; transform: translateY(8px) scale(0.9); }
  }
  .count.hot .c-unit b { color: var(--burgundy); }
  .pick-strip { display: flex; gap: 8px; }
  .pick-t {
    position: relative; width: 64px; height: 64px; border-radius: 12px;
    overflow: hidden; border: 1px solid var(--line-2); flex: none;
    background: rgba(255, 255, 255, 0.5);
  }
  .pick-t img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pick-t .noimg { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
  .p-price {
    position: absolute; bottom: 2px; inset-inline: 0; text-align: center;
    font-size: 8.5px; font-weight: 800; color: #fff; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
  }
  :global(.orow) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
  }
  .o-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: right;
    padding: 0;
    font-family: inherit;
  }
  .o-ic {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .o-ic.gold { background: linear-gradient(150deg, var(--gold), #a4803e); }
  .o-ic.soon { background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep)); }
  .o-ic.calm { background: var(--accent-soft); }
  .o-when {
    flex: none;
    font-size: 11.5px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .o-when.gold { background: rgba(201, 161, 90, 0.18); color: #8a6a2f; }
  .o-when.soon { background: rgba(181, 73, 91, 0.12); color: var(--burgundy); }
  .o-when.calm { background: rgba(122, 46, 58, 0.07); color: var(--taupe); }
  .o-wa {
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(37, 211, 102, 0.35);
    background: rgba(37, 211, 102, 0.12);
    color: #1faf54;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .o-x {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: none;
    background: rgba(181, 73, 91, 0.08);
    color: var(--burgundy);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  :global(.later) { padding: 12px 14px; }
  .l-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.35);
  }
</style>
