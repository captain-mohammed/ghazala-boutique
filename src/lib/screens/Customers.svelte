<script>
  /* الزبونات — دفتر الزبونات الذي يبني نفسه
     لا إدخال يدوي: كل زبونة تُجمع تلقائياً من المبيعات والحجوزات والمناسبات،
     مع إجمالياتها، وآخر زيارة، وشارات (VIP / حجز / مناسبة قريبة)، وسجل كامل. */
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db, upcomingOccasions, addReferral, addTestimonial, referralStats } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, salePieces, daysAgoStart, buzz, sendWhatsApp, buildSalesMessage } from '../utils.js';
  import { toastOk } from '../store.js';

  let { goto } = $props();

  let customers = $state([]);
  let q = $state('');
  let detail = $state(null); // { name, phone, sales, reservations, occasions }
  let loading = $state(true);

  onMount(load);
  async function load() {
    loading = true;
    const [sales, reservations, occasions] = await Promise.all([
      db.sales.toArray(),
      db.reservations.toArray(),
      db.occasions.toArray()
    ]);
    const map = new Map();
    const key = (n, p) => `${(n || '').trim()}|${(p || '').trim()}`;
    const touch = (n, p) => {
      if (!(n || '').trim() && !(p || '').trim()) return null;
      const k = key(n, p);
      if (!map.has(k)) map.set(k, { name: (n || '').trim() || 'زبونة', phone: (p || '').trim(), sales: [], reservations: [], occasions: [] });
      return map.get(k);
    };
    for (const s of sales) { const c = touch(s.customerName, s.customerPhone); if (c) c.sales.push(s); }
    for (const r of reservations) { const c = touch(r.customerName, r.customerPhone); if (c && r.status !== 'cancelled') c.reservations.push(r); }
    for (const o of occasions) { const c = touch(o.customerName, o.customerPhone); if (c) c.occasions.push(o); }

    const weekAgo = daysAgoStart(6);
    refStats = await referralStats();
    customers = [...map.values()].map((c) => {
      const sales = [...c.sales].sort((a, b) => new Date(b.date) - new Date(a.date));
      const active = sales.filter((s) => s.status !== 'returned');
      const spent = active.reduce((a, s) => a + (s.subtotal || 0), 0);
      const pieces = active.reduce((a, s) => a + salePieces(s), 0);
      const last = sales[0]?.date || null;
      const openRes = c.reservations.filter((r) => r.status === 'active' && new Date(r.expiresAt) > new Date());
      const nextOcc = nextOccasionOf(c.occasions);
      const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
      return {
        ...c, sales, spent, pieces, last, openRes,
        orders: active.length,
        vip: spent >= 150000 || active.length >= 3,
        recent: last ? new Date(last) >= weekAgo : false,
        nextOcc,
        daysSince,
        /* ختم الغزالة: كل 5 عمليات مكتملة = بطاقة مكتملة — مشتق بلا سكيما */
        stampFill: active.length > 0 && active.length % 5 === 0 ? 5 : active.length % 5,
        stampCards: Math.floor(active.length / 5)
      };
    }).sort((a, b) => b.spent - a.spent);
    loading = false;
  }

  /* الزبونات الغايبات: كانوا يبيعن ثم صمتن 21 يوم أو أكثر — يستاهلن سالّمة */
  const goneQuiet = $derived(
    customers.filter((c) => c.daysSince !== null && c.daysSince >= 21).sort((a, b) => b.daysSince - a.daysSince)
  );

  /* ---------- ما بعد البيع: الإحالة والشهادة ----------
     من شيت الزبونة: «جتني من…» يُقيّد الفضل، و«رأيها» يُضيف شهادة للوحة المواسم. */
  let refOpen = $state(false);
  let refName = $state('');
  let refPhone = $state('');
  let refPick = $state(null); // زبونة مختارة من الدفتر
  async function saveReferral(c) {
    if (!refPick && !refName.trim()) return toastErr('اختاري أو اكتبي اسم الصديقة');
    const r = await addReferral({ fromName: c.name, fromPhone: c.phone, toName: refPick?.name || refName, toPhone: refPick?.phone || refPhone });
    if (!r.ok) return toastErr(r.dup ? 'مسجلة من قبل لصديقة أخرى' : 'تعذر الحفظ');
    refOpen = false; refName = ''; refPhone = ''; refPick = null;
    buzz([14, 30, 14]);
    toastOk('قُيّد الفضل لها 💛 — يشوفه في شريطها');
    load();
  }
  let tstOpen = $state(false);
  let tstText = $state('');
  let tstStars = $state(5);
  async function saveTestimonial(c) {
    if (!tstText.trim()) return toastErr('اكتبي رأيها أول');
    const last = c.sales[0];
    const lastItem = last?.items?.[0];
    await addTestimonial({ customerName: c.name, customerPhone: c.phone, text: tstText, rating: tstStars, modelId: lastItem?.modelId || '' });
    tstOpen = false; tstText = ''; tstStars = 5;
    buzz([14, 30, 14]);
    toastOk('أُضيفت شهادتها — تتألق في لوحة المواسم ⭐');
  }

  async function waGoneQuiet(c) {
    const msg = `مرحباً ${c.name} 🌷\nشتقتنا! وصلت موديلات جديدة على ذوقك بالضبط 💛\nمعك بوتيك غزالة — وقت ما تمرين، الباب مفتوح 🦌`;
    const { opened } = await sendWhatsApp(msg, c.phone);
    if (opened) toastOk('فُتح واتساب — أرسلي الرسالة 💬');
  }

  function nextOccasionOf(list) {
    if (!list?.length) return null;
    const today = new Date();
    const withDiff = list.map((o) => {
      let d = new Date(today.getFullYear(), Number(o.month) - 1, Number(o.day));
      if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate())) d = new Date(today.getFullYear() + 1, Number(o.month) - 1, Number(o.day));
      return { ...o, diff: Math.round((d - today) / 86400000) };
    });
    return withDiff.sort((a, b) => a.diff - b.diff)[0];
  }

  const filtered = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(s));
  });

  /* ---- windowing: فقط شريحة من قائمة الزبائن (قد تتجاوز الألف) داخل الـDOM.
     التمرير يكبّر الشريحة عبر مراقب تقاطع. ---- */
  const CUST_CAP = 40;
  const CUST_STEP = 40;
  let custVisible = $state(CUST_CAP);
  let custSentinel = $state(null);
  const custShown = $derived(filtered.slice(0, custVisible));
  $effect(() => { filtered; custVisible = CUST_CAP; });
  $effect(() => {
    const el = custSentinel;
    if (!el) return;
    const io = new IntersectionObserver(() => { custVisible += CUST_STEP; }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  });

  function openDetail(c) {
    buzz(6);
    detail = c;
  }

  let refStats = $state([]);
  async function waCustomer(c) {
    const msg = `مرحباً ${c.name} 🌷\nمعك ${'بوتيك غزالة'} — نحب نبقيك على اطلاع بجديد الموديلات التي تناسب ذوقك 💛`;
    const { opened } = await sendWhatsApp(msg, c.phone);
    if (opened) toastOk('فُتح واتساب — أرسلي الرسالة 💬');
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="hero rise" style="padding:16px">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div>
        <h1 class="h1">الزبونات</h1>
        <div class="muted small">{fmtNum(customers.length)} زبونة — الدفتر يبني نفسه من مبيعاتك</div>
      </div>
      <span class="hero-ic"><Icon name="user" size={22} color="var(--burgundy)" /></span>
    </div>
  </Glass>

  {#if loading}
    <div class="muted small" style="text-align:center; padding:30px">…جاري الجمع</div>
  {:else if !customers.length}
    <EmptyState
      title="لا زبونات بعد"
      body="أول عملية بيع أو حجز بضيف أسماء زبوناتك — وستظهر هنا تلقائياً بإجمالياتها"
      icon="user"
    />
  {:else}
    <div class="search glass-strong">
      <Icon name="search" size={16} color="var(--taupe)" />
      <input bind:value={q} placeholder="ابحثي بالاسم أو الرقم…" />
    </div>

    {#if goneQuiet.length}
      <Glass class="rise gone" style="padding:13px 14px">
        <div class="row" style="gap:7px; align-items:center; margin-bottom:8px">
          <span class="gone-ic">🌙</span>
          <span class="bold small">غايبين عنا</span>
          <span class="muted tiny">صامتات من 21 يوم أو أكثر</span>
        </div>
        <div class="stack" style="gap:7px">
          {#each goneQuiet.slice(0, 6) as c (c.name + '|' + c.phone)}
            <div class="row" style="gap:8px; align-items:center">
              <span class="g-name">{c.name}</span>
              <span class="muted tiny">منذ {fmtNum(c.daysSince)} يوم</span>
              <button class="g-wa" onclick={() => waGoneQuiet(c)} disabled={!c.phone}>
                <Icon name="whatsapp" size={12} /> سالّمي عليها
              </button>
            </div>
          {/each}
        </div>
      </Glass>
    {/if}

    {#each custShown as c, i (c.name + '|' + c.phone)}
      <Glass class="rise" style="animation-delay:{Math.min(i * 0.04, 0.3)}s; padding:13px 14px">
        <button class="cust" onclick={() => openDetail(c)}>
          <span class="avatar" class:vip={c.vip}>{c.name.trim().charAt(0)}</span>
          <div class="c-body">
            <div class="row" style="gap:7px; align-items:center">
              <span class="c-name">{c.name}</span>
              {#if c.vip}<span class="badge gold"><Icon name="flame" size={10} /> VIP</span>{/if}
              {#if c.openRes.length}<span class="badge warn"><Icon name="clock" size={10} /> حجز</span>{/if}
              {#if c.nextOcc && c.nextOcc.diff <= 14}<span class="badge rose">🎂 {fmtNum(c.nextOcc.diff)} يوم</span>{/if}
            </div>
            <div class="muted tiny">
              {fmtNum(c.orders)} عملية — {fmtNum(c.pieces)} قطعة
              {#if c.phone}- {c.phone}{/if}
            </div>
            <div class="stamps" title="ختم الغزالة: كل 5 عمليات = بطاقة مكتملة">
              {#each Array(5) as _, si (si)}
                <i class="stamp" class:on={si < c.stampFill}></i>
              {/each}
              {#if c.stampCards > 0}<b class="st-x">{fmtNum(c.stampCards)} 🦌</b>{/if}
            </div>
          </div>
          <div class="col" style="align-items:flex-end; gap:2px; flex:none">
            <span class="money small">{fmtIQD(c.spent)}</span>
            <span class="muted tiny">{c.last ? fmtDate(c.last) : '—'}</span>
          </div>
        </button>
      </Glass>
    {/each}
    {#if custVisible < filtered.length}
      <div class="more-row">
        <button type="button" class="chip" onclick={() => (custVisible += CUST_STEP)}>
          عرض المزيد ({fmtNum(filtered.length - custVisible)} زبونة)
        </button>
        <div bind:this={custSentinel} class="more-sentinel" aria-hidden="true"></div>
      </div>
    {/if}
  {/if}
</div>

<Sheet open={!!detail} title={detail?.name || ''} onclose={() => (detail = null)}>
  {#if detail}
    <div class="stack" style="gap:12px">
      <Glass style="padding:14px">
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="bold">{detail.name}{detail.vip ? ' ⭐' : ''}</div>
            <div class="muted small" dir="ltr" style="text-align:right">{detail.phone || 'بلا رقم'}</div>
          </div>
          <div class="col" style="align-items:flex-end; gap:2px">
            <span class="money">{fmtIQD(detail.spent)}</span>
            <span class="muted tiny">إجمالي مشترياتها</span>
          </div>
        </div>
        <div class="stats">
          <div><b>{fmtNum(detail.orders)}</b><span>عملية</span></div>
          <div><b>{fmtNum(detail.pieces)}</b><span>قطعة</span></div>
          <div><b>{fmtNum(detail.reservations.length)}</b><span>حجز</span></div>
        </div>
        <div class="stamps big" title="ختم الغزالة: كل 5 عمليات = بطاقة مكتملة">
          {#each Array(5) as _, si (si)}
            <i class="stamp" class:on={si < detail.stampFill}></i>
          {/each}
          {#if detail.stampCards > 0}<b class="st-x">{fmtNum(detail.stampCards)} بطاقة مكتملة 🦌</b>{/if}
        </div>
        {#if detail.phone}
          <button class="btn gold block" onclick={() => waCustomer(detail)}>
            <Icon name="whatsapp" size={16} /> واتساب
          </button>
        {/if}
        <div class="row" style="gap:8px">
          <button class="btn" style="flex:1; min-height:40px" onclick={() => { refOpen = true; refName = ''; refPhone = ''; refPick = null; }}>
            <Icon name="sparkle" size={14} /> جتني من…
          </button>
          <button class="btn" style="flex:1; min-height:40px" onclick={() => { tstOpen = true; tstText = ''; tstStars = 5; }}>
            <Icon name="flame" size={14} /> أضيفي رأيها
          </button>
        </div>
        {#if (refStats.find((x) => x.fromName === detail.name)?.friends?.length)}
          <div class="ref-ribbon">
            <Icon name="sparkle" size={13} color="#8a6a35" />
            <span>جابت <b>{fmtNum(refStats.find((x) => x.fromName === detail.name).friends.length)}</b> صديقة {refStats.find((x) => x.fromName === detail.name).friends.map((f) => f.name).join('، ')}</span>
          </div>
        {/if}
        {#if detail.nextOcc}
          <div class="occ-line muted small">🎂 {detail.nextOcc.label} — بعد {fmtNum(detail.nextOcc.diff)} يوم</div>
        {/if}
      </Glass>

      <div class="muted tiny bold" style="margin-top:2px">سجل العمليات</div>
      {#each detail.sales as s (s.id)}
        <Glass style="padding:10px 12px">
          <div class="row" style="justify-content:space-between">
            <span class="bold small">{fmtDate(s.date)}</span>
            <span class="money small">{fmtIQD(s.subtotal)}</span>
          </div>
          <div class="muted tiny">{fmtNum(salePieces(s))} قطعة{s.status === 'returned' ? ' — راجع' : ''}{s.province ? ` - ${s.province}` : ''}</div>
        </Glass>  {:else}
    <div class="muted small">لا عمليات بعد</div>
  {/each}
    </div>
  {/if}
</Sheet>

<!-- التقاط الإحالة: اختاري من الدفتر أو اكتبي زبونة جديدة -->
<Sheet open={refOpen} title="جتني من…" onclose={() => (refOpen = false)}>
  <div class="stack" style="gap:10px">
    <div class="muted small">من جابت صديقتها؟ الفضل يُسجَّل باسمها ويتجمع في شريطها الذهبي.</div>
    {#if refPick}
      <button class="btn gold block" style="min-height:42px" onclick={() => saveReferral(detail)}>
        <Icon name="check" size={15} /> قيّديها: {detail?.name} جابت {refPick.name}
      </button>
    {:else}
      <input class="input" bind:value={refName} placeholder="اسم الصديقة…" />
      <input class="input" bind:value={refPhone} dir="ltr" inputmode="tel" placeholder="رقمها (اختياري)" style="text-align:right" />
      <div class="row wrap" style="gap:6px">
        {#each customers.filter((c) => c.name !== detail?.name).slice(0, 8) as c (c.name + '|' + c.phone)}
          <button class="chip" onclick={() => { refPick = c; }}>{c.name}</button>
        {/each}
      </div>
      {#if refName.trim()}
        <button class="btn gold block" style="min-height:42px" onclick={() => saveReferral(detail)}>
          <Icon name="check" size={15} /> قيّديها: {detail?.name} جابت {refName}
        </button>
      {/if}
    {/if}
  </div>
</Sheet>

<!-- التقاط الشهادة: نجوم + نص -->
<Sheet open={tstOpen} title="رأي الزبونة" onclose={() => (tstOpen = false)}>
  <div class="stack" style="gap:10px">
    <div class="muted small">شهادتها تتألق في لوحة المواسم بالرئيسية — وكُلّيها بصدقها.</div>
    <div class="stars">
      {#each [1, 2, 3, 4, 5] as s (s)}
        <button class="star" class:on={s <= tstStars} onclick={() => (tstStars = s)}>★</button>
      {/each}
    </div>
    <textarea class="input" rows="3" bind:value={tstText} placeholder="«مقاسها مضبوط والتغليف تحفة…»"></textarea>
    <button class="btn gold block" style="min-height:44px" onclick={() => saveTestimonial(detail)}>
      <Icon name="check" size={15} /> أضيفي شهادتها
    </button>
  </div>
</Sheet>

<style>
  .more-row { display: flex; justify-content: center; padding: 18px 0 28px; }
  .more-sentinel { height: 1px; width: 100%; }
  .hero-ic {
    width: 44px; height: 44px; border-radius: 14px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1);
    border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .search {
    display: flex; align-items: center; gap: 8px;
    padding: 11px 14px; border-radius: 14px;
  }
  .search input {
    flex: 1; border: none; background: none; outline: none;
    font-family: inherit; font-size: 13.5px; color: var(--ink); min-width: 0;
  }
  .cust {
    width: 100%; display: flex; align-items: center; gap: 11px;
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; text-align: right;
  }
  .avatar {
    width: 42px; height: 42px; border-radius: 50%; flex: none;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 17px; color: var(--burgundy);
    background: rgba(181, 73, 91, 0.1);
    border: 1.5px solid rgba(181, 73, 91, 0.22);
  }
  .avatar.vip { border-color: var(--gold); box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.18); }
  .c-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .c-name { font-weight: 800; font-size: 14.5px; color: var(--ink); }
  .badge {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9.5px; font-weight: 800; letter-spacing: 0.3px;
    padding: 2px 7px; border-radius: 999px; flex: none;
  }
  .badge.gold { color: #8a6d1a; background: rgba(212, 175, 55, 0.16); }
  .badge.warn { color: #9a5b16; background: rgba(230, 145, 56, 0.16); }
  .badge.rose { color: var(--burgundy); background: rgba(181, 73, 91, 0.12); }
  .stats {
    display: flex; justify-content: space-around;
    margin-top: 12px; padding-top: 10px;
    border-top: 1px dashed var(--line-2);
  }
  .stats div { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .stats b { font-size: 16px; color: var(--ink); font-variant-numeric: tabular-nums; }
  .stats span { font-size: 10.5px; color: var(--taupe); }
  .occ-line { margin-top: 8px; text-align: center; }
  /* ختم الغزالة: خمس نقاط ذهبية تتملى مع العمليات */
  .stamps { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
  .stamps.big { margin-top: 10px; justify-content: center; }
  .stamp {
    width: 9px; height: 9px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    border: 1.5px solid var(--line-2);
    flex: none;
  }
  .stamp.on {
    background: linear-gradient(150deg, var(--gold), #a4803e);
    border-color: transparent;
    box-shadow: 0 1px 4px rgba(164, 128, 62, 0.4);
  }
  .st-x { font-size: 10px; font-weight: 800; color: #8a6a35; margin-inline-start: 4px; }
  /* شريط الإحالة الذهبي داخل شيت الزبونة */
  .ref-ribbon {
    display: flex; align-items: center; gap: 6px;
    margin-top: 10px; padding: 7px 11px;
    background: linear-gradient(90deg, rgba(212, 175, 55, 0.14), rgba(212, 175, 55, 0.04));
    border: 1px dashed rgba(164, 128, 62, 0.4);
    border-radius: 10px;
    font-size: 11.5px; color: var(--ink-2);
  }
  .ref-ribbon b { color: #8a6a35; }
  /* نجوم الشهادة */
  .stars { display: flex; gap: 4px; justify-content: center; }
  .star {
    background: none; border: none; font-size: 26px; cursor: pointer;
    color: var(--line-2); padding: 0 3px; font-family: inherit;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.15s;
  }
  .star.on { color: var(--gold); text-shadow: 0 2px 8px rgba(212, 175, 55, 0.4); }
  .star:active { transform: scale(1.3); }
  /* الزبونات الغايبات */
  /* Glass host — scoped CSS never reaches it, so it must be global */
  :global(.gone) { border-inline-start: 3px solid rgba(156, 123, 107, 0.45); }
  .gone-ic { font-size: 15px; }
  .g-name { font-weight: 800; font-size: 12.5px; color: var(--ink); }
  .g-wa {
    margin-inline-start: auto;
    display: inline-flex; align-items: center; gap: 4px;
    font-family: inherit; font-size: 10.5px; font-weight: 800;
    color: #1f7a44;
    background: rgba(37, 211, 102, 0.14);
    border: none; border-radius: 999px;
    padding: 4px 10px; cursor: pointer;
  }
  .g-wa:active { transform: scale(0.95); }
</style>
