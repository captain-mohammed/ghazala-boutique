<script>
  /* متجري — صورة المتجر كاملة من أول سجل إلى اليوم.
     لا فلاتر ولا فترات: كل ما في قاعدة البيانات، مجتمعاً في صفحة واحدة.
     هذه الصفحة هي «بصمة» البوتيك: كم عمره، كم باع، كم ربح، ماذا في رفّه،
     ومن يقف خلفه — كل رقم محسوب من بياناته الحقيقية لا من تقدير. */
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Ticker from '../components/Ticker.svelte';
  import { db, loadProducts, vaultState, moneyInTransit, historicalPayments, modelGroupKey } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, salePieces, baghdadDayKey, baghdadMonthKeyOf, MONTHS_AR } from '../utils.js';

  let products = $state([]);
  let sales = $state([]);
  let expenses = $state([]);
  let reservations = $state([]);
  let referrals = $state([]);
  let testimonials = $state([]);
  let waitlists = $state([]);
  let movements = $state([]);
  let vault = $state(null);
  let transit = $state(0);
  let archive = $state([]);
  let loaded = $state(false);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, e, rv, rf, ts, wl, mv, v, tr, ar] = await Promise.all([
        loadProducts(), db.sales.toArray(), db.expenses.toArray(),
        db.reservations.toArray(), db.referrals.toArray(), db.testimonials.toArray(),
        db.waitlists.toArray(), db.movements.toArray(),
        vaultState(), moneyInTransit(), historicalPayments()
      ]);
      if (!alive) return;
      products = p; sales = s; expenses = e; reservations = rv;
      referrals = rf; testimonials = ts; waitlists = wl; movements = mv;
      vault = v; transit = tr; archive = ar;
      loaded = true;
    };
    grab();
    const t = setInterval(grab, 6000);
    return () => { alive = false; clearInterval(t); };
  });

  /* ---- المال: كل الوقت ---- */
  const liveSales = $derived(sales.filter((s) => s.status !== 'returned'));
  const revenue = $derived(liveSales.reduce((a, s) => a + (Number(s.subtotal) || 0), 0));
  const profit = $derived(liveSales.reduce((a, s) => a + (Number(s.profit) || 0), 0));
  const expTotal = $derived(expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0));
  const net = $derived(profit - expTotal);
  const deliveryTotal = $derived(liveSales.reduce((a, s) => a + (Number(s.deliveryFee) || 0), 0));

  /* ---- المبيعات ---- */
  const saleCount = $derived(liveSales.length);
  const returnedCount = $derived(sales.filter((s) => s.status === 'returned').length);
  const piecesSold = $derived(liveSales.reduce((a, s) => a + salePieces(s), 0));
  const avgSale = $derived(saleCount ? Math.round(revenue / saleCount) : 0);
  const lastSale = $derived([...liveSales].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null);

  /* ---- عمر المتجر: من أول سجل حتى اليوم (بتوقيت بغداد) ---- */
  const firstDay = $derived.by(() => {
    const all = [...sales.map((s) => s.date), ...products.map((p) => p.createdAt || p.updatedAt), ...expenses.map((e) => e.date)]
      .filter(Boolean).sort();
    return all[0] || null;
  });
  const ageDays = $derived(firstDay ? Math.max(1, Math.round((Date.now() - new Date(firstDay).getTime()) / 86400000)) : 0);

  /* ---- المخزون ---- */
  const models = $derived(new Set(products.map((p) => modelGroupKey(p))).size);
  const piecesOnShelf = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0), 0));
  const stockCost = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0));
  const stockPrice = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.price) || 0), 0));
  const oosModels = $derived(
    new Set(products.filter((p) => !(Number(p.qty) > 0)).map((p) => modelGroupKey(p))).size
  );
  const lastArrival = $derived(products.map((p) => p.createdAt || p.updatedAt).filter(Boolean).sort().pop() || null);

  /* نفدت كلها = كل بطاقات الموديل صفر (نفس منطق syncModelOos) */
  const liveModels = $derived(new Set(products.filter((p) => Number(p.qty) > 0).map((p) => modelGroupKey(p))).size);
  /* نسبة التصريف الحقيقية: قطعة بيعت من كل قطعة دخلت الرف يوماً */
  const arrivedPieces = $derived(movements.filter((m) => m.type === 'in').reduce((a, m) => a + (Number(m.qty) || 0), 0));
  const sellThrough = $derived(arrivedPieces ? Math.min(100, Math.round((piecesSold / arrivedPieces) * 100)) : 0);
  /* راكد: بطاقات عمرها 30 يوماً أو أكثر وما تحركت */
  const deadPieces = $derived.by(() => {
    const moved = new Map();
    for (const m of movements) if (m.type === 'out' && m.sku && m.date) {
      const t = new Date(m.date).getTime();
      if (!moved.has(m.sku) || t > moved.get(m.sku)) moved.set(m.sku, t);
    }
    const cut = Date.now() - 30 * 86400000;
    return products.filter((p) => (Number(p.qty) || 0) > 0 && (moved.get(p.sku) || 0) < cut)
      .reduce((a, p) => a + (Number(p.qty) || 0), 0);
  });

  /* ---- الأطراف ---- */
  const customers = $derived(new Set(liveSales.map((s) => String(s.customerPhone || '').replace(/\D/g, '')).filter((x) => x.length >= 10)).size);
  const suppliers = $derived(new Set(products.map((p) => (p.supplier || '').trim()).filter(Boolean)).size);
  const companies = $derived(new Set(liveSales.map((s) => (s.deliveryCompany || '').trim()).filter(Boolean)).size);
  const provinces = $derived(new Set(liveSales.map((s) => (s.province || '').trim()).filter(Boolean)).size);

  /* ---- إيقاع البيع: أفضل يوم وأفضل شهر فعلاً ---- */
  const byDay = $derived.by(() => {
    const m = new Map();
    for (const s of liveSales) {
      const k = baghdadDayKey(s.date);
      m.set(k, (m.get(k) || 0) + (Number(s.subtotal) || 0));
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, total: v })).sort((a, b) => b.total - a.total);
  });
  const bestDay = $derived(byDay[0] || null);
  const byMonth = $derived.by(() => {
    const m = new Map();
    for (const s of liveSales) {
      const k = baghdadMonthKeyOf(s.date);
      const cur = m.get(k) || { key: k, total: 0, count: 0 };
      cur.total += Number(s.subtotal) || 0;
      cur.count++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  });
  const monthLabel = (k) => {
    const [y, mo] = String(k).split('-');
    return `${MONTHS_AR[Number(mo) - 1] || mo} ${y}`;
  };

  /* ---- الأعلى ربحاً ---- */
  const byType = $derived.by(() => {
    const m = new Map();
    for (const s of liveSales) for (const it of s.items || []) {
      const k = it.type || 'غير محدد';
      const cur = m.get(k) || { name: k, profit: 0, qty: 0, revenue: 0 };
      const q = Number(it.qty) || 0;
      cur.qty += q;
      cur.revenue += (Number(it.price) || 0) * q;
      cur.profit += ((Number(it.price) || 0) - (Number(it.cost) || 0)) * q;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.profit - a.profit);
  });
  const topType = $derived(byType[0] || null);
  const topThreeTypes = $derived(byType.slice(0, 3));

  const bySupplier = $derived.by(() => {
    const m = new Map();
    for (const p of products) {
      const k = (p.supplier || '').trim() || 'غير محدد';
      const cur = m.get(k) || { name: k, cost: 0, qty: 0, models: new Set() };
      cur.qty += Number(p.qty) || 0;
      cur.cost += (Number(p.qty) || 0) * (Number(p.cost) || 0);
      cur.models.add(modelGroupKey(p));
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  });
  const topSupplier = $derived(bySupplier[0] || null);

  /* ---- التسويق والوفاء: أرقام حقيقية من جداولها ---- */
  const waitCount = $derived(waitlists.filter((w) => !w.notified).length);
  const refCount = $derived(referrals.length);
  const tstCount = $derived(testimonials.length);
  const tstAvg = $derived(tstCount ? (testimonials.reduce((a, t) => a + (Number(t.rating) || 0), 0) / tstCount) : 0);
  const openRes = $derived(reservations.filter((r) => r.status === 'active' && new Date(r.expiresAt) > new Date()).length);

  const vaultBal = $derived(vault?.balance ?? 0);
  const archiveTotal = $derived(archive.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const empty = $derived(loaded && !sales.length && !products.length && !expenses.length);
  const range = $derived(firstDay ? `${fmtDate(firstDay).split(' • ')[0]} — اليوم` : 'لا سجلات بعد');

  /* هامش الربح الحقيقي */
  const margin = $derived(revenue ? Math.round((profit / revenue) * 100) : 0);

  /* ---- الأقسام القابلة للطيّ: كل قسم ينطوي بلمسة على عنوانه ---- */
  let secOpen = $state({ money: true, sales: true, shelf: true, people: true, rhythm: false, top: false });
  const toggleSec = (k) => { secOpen[k] = !secOpen[k]; };
</script>

<div class="stack" style="gap:12px">
  <!-- ── رأس المتجر: هويته وعمره، لا مجرد عنوان ── -->
  <Glass class="hero store-hero rise">
    <div class="sh-top">
      <span class="sh-logo"><Icon name="store" size={24} color="#fff" /></span>
      <div class="sh-id">
        <h1 class="h1">متجري</h1>
        <div class="sh-sub">بوتيك غزالة — صورتك كاملة بالأرقام</div>
      </div>
    </div>
    <div class="sh-meta">
      <span class="sh-chip"><Icon name="calendar" size={12} color="var(--gold)" /> {range}</span>
      {#if ageDays}<span class="sh-chip"><Icon name="sparkle" size={12} color="var(--gold)" /> {fmtNum(ageDays)} يوم على الرف</span>{/if}
      {#if saleCount}<span class="sh-chip"><Icon name="cart" size={12} color="var(--gold)" /> {fmtNum(saleCount)} عملية</span>{/if}
    </div>
  </Glass>

  {#if !loaded}
    <div class="muted small" style="text-align:center; padding:26px">…جاري جمع الملخص</div>
  {:else if empty}
    <EmptyState
      title="متجرك لسه فاضي"
      body="أضيفي أول موديل وسجّلي أول بيعة — وهنا تشوفين كل شيء مجتمعاً"
      icon="store"
    />
  {:else}
    <!-- ── الأرقام الكبيرة: الربح والإيراد والمخزون — البصمة أولاً ── -->
    <div class="hero-stats rise" style="animation-delay:.04s">
      <Glass class="hs hs-main">
        <span class="hs-l">صافي الربح</span>
        <span class="hs-v gold" data-val={profit}><Ticker value={profit} /> <span class="cur">د.ع</span></span>
        <span class="hs-s">هامش {fmtNum(margin)}% من الإيراد</span>
      </Glass>
      <Glass class="hs">
        <span class="hs-l">الإيرادات</span>
        <span class="hs-v" data-val={revenue}><Ticker value={revenue} /> <span class="cur">د.ع</span></span>
        <span class="hs-s">{fmtNum(saleCount)} عملية</span>
      </Glass>
      <Glass class="hs">
        <span class="hs-l">قيمة الرف</span>
        <span class="hs-v" data-val={stockPrice}><Ticker value={stockPrice} /> <span class="cur">د.ع</span></span>
        <span class="hs-s">{fmtNum(models)} موديل · {fmtNum(piecesOnShelf)} قطعة</span>
      </Glass>
    </div>

    <!-- ══ المال ══ -->
    <section>
      <button class="sec-t" onclick={() => toggleSec('money')} aria-expanded={secOpen.money}>
        <span class="st-ic"><Icon name="wallet" size={15} color="var(--burgundy)" /></span>
        <span class="st-t">المال — كل الوقت</span>
        <span class="st-chev" class:open={secOpen.money}><Icon name="back" size={13} color="var(--taupe)" /></span>
      </button>
      {#if secOpen.money}
        <div class="grid">
          <Glass class="stat">
            <span class="s-ic"><Icon name="sparkle" size={16} color="var(--burgundy)" /></span>
            <span class="sl">صافي الربح</span>
            <span class="s-v gold" data-val={profit}><Ticker value={profit} /> <span class="cur">د.ع</span></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="file" size={16} color="var(--burgundy)" /></span>
            <span class="sl">المصاريف</span>
            <span class="s-v" data-val={expTotal}><Ticker value={expTotal} /> <span class="cur">د.ع</span></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="check" size={16} color="var(--burgundy)" /></span>
            <span class="sl">الربح بعد المصاريف</span>
            <span class="s-v" class:good={net >= 0} class:bad={net < 0} data-val={net}><Ticker value={net} /> <span class="cur">د.ع</span></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="truck" size={16} color="var(--burgundy)" /></span>
            <span class="sl">أجور التوصيل (للشركات)</span>
            <span class="s-v" data-val={deliveryTotal}><Ticker value={deliveryTotal} /> <span class="cur">د.ع</span></span>
          </Glass>
        </div>
        <!-- شريط التوزيع الحقيقي: إيراد → ربح + مصاريف -->
        {#if revenue > 0}
          <Glass class="flow">
            <div class="fl-h">
              <span class="muted tiny">كيف توزّع الإيراد</span>
              <span class="muted tiny">{fmtIQD(revenue)}</span>
            </div>
            <div class="fl-bar" role="img" aria-label="توزيع الإيراد">
              <span class="fl-seg profit" style="width:{Math.max(0, Math.min(100, (profit / revenue) * 100))}%" title="ربح"></span>
              <span class="fl-seg rest" style="width:{Math.max(0, 100 - Math.max(0, Math.min(100, (profit / revenue) * 100)))}%" title="تكلفة"></span>
            </div>
            <div class="fl-legend">
              <span class="lg"><i class="dot profit"></i> ربح {fmtNum(margin)}%</span>
              <span class="lg"><i class="dot rest"></i> تكلفة البضاعة {fmtNum(100 - margin)}%</span>
              {#if expTotal}<span class="lg"><i class="dot gold"></i> مصاريف خارجية {fmtIQD(expTotal)}</span>{/if}
            </div>
          </Glass>
        {/if}
        <Glass class="vault-row">
          <span class="vr-l"><Icon name="sparkle" size={14} color="var(--gold)" /> الخزنة (الربح المتراكم)</span>
          <span class="s-v gold" data-val={vaultBal}><Ticker value={vaultBal} /> <span class="cur">د.ع</span></span>
        </Glass>
      {/if}
    </section>

    <!-- ══ المبيعات ══ -->
    <section>
      <button class="sec-t" onclick={() => toggleSec('sales')} aria-expanded={secOpen.sales}>
        <span class="st-ic"><Icon name="cart" size={15} color="var(--burgundy)" /></span>
        <span class="st-t">المبيعات</span>
        <span class="st-badge">{fmtNum(saleCount)}</span>
        <span class="st-chev" class:open={secOpen.sales}><Icon name="back" size={13} color="var(--taupe)" /></span>
      </button>
      {#if secOpen.sales}
        <div class="grid">
          <Glass class="stat">
            <span class="s-ic"><Icon name="cart" size={16} color="var(--burgundy)" /></span>
            <span class="sl">عدد العمليات</span>
            <span class="s-v" data-val={saleCount}><Ticker value={saleCount} /></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="box" size={16} color="var(--burgundy)" /></span>
            <span class="sl">القطع المباعة</span>
            <span class="s-v" data-val={piecesSold}><Ticker value={piecesSold} /></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="undo" size={16} color="var(--burgundy)" /></span>
            <span class="sl">الرواجع</span>
            <span class="s-v" data-val={returnedCount}><Ticker value={returnedCount} /></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="chart" size={16} color="var(--burgundy)" /></span>
            <span class="sl">معدل العملية</span>
            <span class="s-v" data-val={avgSale}><Ticker value={avgSale} /> <span class="cur">د.ع</span></span>
          </Glass>
        </div>
        {#if lastSale}
          <Glass class="last">
            <div style="min-width:0">
              <div class="muted tiny">آخر عملية بيع</div>
              <div class="bold small">#{lastSale.id} — {lastSale.customerName || 'زبونة'}</div>
              <div class="muted tiny">{fmtDate(lastSale.date)}</div>
            </div>
            <span class="s-v gold" data-val={lastSale.total}><Ticker value={lastSale.total} /> <span class="cur">د.ع</span></span>
          </Glass>
        {/if}
      {/if}
    </section>

    <!-- ══ الرفّ ══ -->
    <section>
      <button class="sec-t" onclick={() => toggleSec('shelf')} aria-expanded={secOpen.shelf}>
        <span class="st-ic"><Icon name="box" size={15} color="var(--burgundy)" /></span>
        <span class="st-t">الرفّ</span>
        <span class="st-badge">{fmtNum(piecesOnShelf)} قطعة</span>
        <span class="st-chev" class:open={secOpen.shelf}><Icon name="back" size={13} color="var(--taupe)" /></span>
      </button>
      {#if secOpen.shelf}
        <div class="grid">
          <Glass class="stat">
            <span class="s-ic"><Icon name="tag" size={16} color="var(--burgundy)" /></span>
            <span class="sl">الموديلات</span>
            <span class="s-v" data-val={models}><Ticker value={models} /></span>
            <span class="muted tiny">{fmtNum(liveModels)} متوفر · {fmtNum(oosModels)} نفد</span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="box" size={16} color="var(--burgundy)" /></span>
            <span class="sl">القطع على الرف</span>
            <span class="s-v" data-val={piecesOnShelf}><Ticker value={piecesOnShelf} /></span>
            <span class="muted tiny">تكلفتها {fmtIQD(stockCost)}</span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="wallet" size={16} color="var(--burgundy)" /></span>
            <span class="sl">قيمة المخزون (تكلفة)</span>
            <span class="s-v" data-val={stockCost}><Ticker value={stockCost} /> <span class="cur">د.ع</span></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="sparkle" size={16} color="var(--burgundy)" /></span>
            <span class="sl">قيمته بالبيع</span>
            <span class="s-v gold" data-val={stockPrice}><Ticker value={stockPrice} /> <span class="cur">د.ع</span></span>
            {#if stockCost > 0}<span class="muted tiny">ربح متوقع {fmtIQD(stockPrice - stockCost)}</span>{/if}
          </Glass>
        </div>
        <!-- نسبة التصريف الحقيقية: كم قطعة تحركت من كل قطعة دخلت -->
        {#if arrivedPieces > 0}
          <Glass class="meter">
            <div class="mt-h">
              <span class="mt-l"><Icon name="chart" size={13} color="var(--gold)" /> نسبة التصريف</span>
              <span class="mt-n">{fmtNum(sellThrough)}%</span>
            </div>
            <div class="mt-bar"><span class="mt-fill" style="width:{sellThrough}%"></span></div>
            <div class="mt-s">تحرّك {fmtNum(piecesSold)} قطعة من {fmtNum(arrivedPieces)} دخلت الرف</div>
          </Glass>
        {/if}
        {#if deadPieces > 0}
          <Glass class="meter warn">
            <div class="mt-h">
              <span class="mt-l"><Icon name="clock" size={13} color="#9a5b16" /> راكد على الرف</span>
              <span class="mt-n warn">{fmtNum(deadPieces)} قطعة</span>
            </div>
            <div class="mt-s">بلا حركة منذ 30 يوماً أو أكثر — راجعي «إصلاح الموديلات» والتقارير</div>
          </Glass>
        {/if}
        {#if lastArrival}
          <div class="muted tiny" style="padding:2px 4px">آخر استلام بضاعة: {fmtDate(lastArrival)}</div>
        {/if}
      {/if}
    </section>

    <!-- ══ الناس ══ -->
    <section>
      <button class="sec-t" onclick={() => toggleSec('people')} aria-expanded={secOpen.people}>
        <span class="st-ic"><Icon name="user" size={15} color="var(--burgundy)" /></span>
        <span class="st-t">الناس</span>
        <span class="st-chev" class:open={secOpen.people}><Icon name="back" size={13} color="var(--taupe)" /></span>
      </button>
      {#if secOpen.people}
        <div class="grid">
          <Glass class="stat">
            <span class="s-ic"><Icon name="user" size={16} color="var(--burgundy)" /></span>
            <span class="sl">الزبونات</span>
            <span class="s-v" data-val={customers}><Ticker value={customers} /></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="upload" size={16} color="var(--burgundy)" /></span>
            <span class="sl">الموردون</span>
            <span class="s-v" data-val={suppliers}><Ticker value={suppliers} /></span>
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="truck" size={16} color="var(--burgundy)" /></span>
            <span class="sl">شركات التوصيل</span>
            <span class="s-v" data-val={companies}><Ticker value={companies} /></span>
            {#if provinces}<span class="muted tiny">{fmtNum(provinces)} محافظة وصلتك طلباتها</span>{/if}
          </Glass>
          <Glass class="stat">
            <span class="s-ic"><Icon name="wallet" size={16} color="var(--burgundy)" /></span>
            <span class="sl">عند الشركات الآن</span>
            <span class="s-v" data-val={transit}><Ticker value={transit} /> <span class="cur">د.ع</span></span>
          </Glass>
        </div>
        {#if archiveTotal > 0}
          <Glass class="arch-row">
            <span class="vr-l"><Icon name="file" size={14} color="var(--taupe)" /> السجل القديم (دفعات مؤرشفة)</span>
            <span class="s-v" data-val={archiveTotal}><Ticker value={archiveTotal} /> <span class="cur">د.ع</span></span>
          </Glass>
        {/if}
      {/if}
    </section>

    <!-- ══ الإيقاع: أفضل يوم وأفضل شهر — أرقام حقيقية من التواريخ ══ -->
    {#if bestDay || byMonth.length}
      <section>
        <button class="sec-t" onclick={() => toggleSec('rhythm')} aria-expanded={secOpen.rhythm}>
          <span class="st-ic"><Icon name="chart" size={15} color="var(--burgundy)" /></span>
          <span class="st-t">إيقاع البيع</span>
          <span class="st-chev" class:open={secOpen.rhythm}><Icon name="back" size={13} color="var(--taupe)" /></span>
        </button>
        {#if secOpen.rhythm}
          <div class="grid two">
            {#if bestDay}
              <Glass class="stat">
                <span class="s-ic"><Icon name="sparkle" size={16} color="var(--burgundy)" /></span>
                <span class="sl">أفضل يوم</span>
                <span class="bold small">{fmtDate(bestDay.key).split(' • ')[0]}</span>
                <span class="s-v gold" data-val={bestDay.total}><Ticker value={bestDay.total} /> <span class="cur">د.ع</span></span>
              </Glass>
            {/if}
            {#if byMonth[0]}
              <Glass class="stat">
                <span class="s-ic"><Icon name="calendar" size={16} color="var(--burgundy)" /></span>
                <span class="sl">أفضل شهر</span>
                <span class="bold small">{monthLabel(byMonth[0].key)}</span>
                <span class="s-v" data-val={byMonth[0].total}><Ticker value={byMonth[0].total} /> <span class="cur">د.ع</span></span>
              </Glass>
            {/if}
          </div>
          {#if byMonth.length > 1}
            <Glass class="months">
              <div class="mh-h"><span class="muted tiny">آخر الأشهر</span></div>
              {#each byMonth.slice(0, 6) as m (m.key)}
                {@const max = byMonth[0].total || 1}
                <div class="mh-row">
                  <span class="mh-l">{monthLabel(m.key)}</span>
                  <span class="mh-bar"><span class="mh-fill" style="width:{Math.max(4, (m.total / max) * 100)}%"></span></span>
                  <span class="mh-v">{fmtNum(m.total)}</span>
                </div>
              {/each}
            </Glass>
          {/if}
        {/if}
      </section>
    {/if}

    <!-- ══ الأعلى ══ -->
    {#if topThreeTypes.length || topSupplier}
      <section>
        <button class="sec-t" onclick={() => toggleSec('top')} aria-expanded={secOpen.top}>
          <span class="st-ic"><Icon name="flame" size={15} color="var(--burgundy)" /></span>
          <span class="st-t">الأعلى</span>
          <span class="st-chev" class:open={secOpen.top}><Icon name="back" size={13} color="var(--taupe)" /></span>
        </button>
        {#if secOpen.top}
          {#if topThreeTypes.length}
            <Glass class="rank">
              <div class="rk-h"><Icon name="flame" size={13} color="var(--gold)" /> أعلى الأنواع ربحاً</div>
              {#each topThreeTypes as t, i (t.name)}
                <div class="rk-row">
                  <span class="rk-n" class:first={i === 0}>{fmtNum(i + 1)}</span>
                  <span class="rk-name">{t.name}</span>
                  <span class="muted tiny">{fmtNum(t.qty)} قطعة</span>
                  <span class="rk-v">{fmtIQD(t.profit)}</span>
                </div>
              {/each}
            </Glass>
          {/if}
          {#if topSupplier}
            <div class="grid two" style="margin-top:9px">
              <Glass class="stat">
                <span class="s-ic"><Icon name="upload" size={16} color="var(--burgundy)" /></span>
                <span class="sl">أكبر مورد</span>
                <span class="bold small">{topSupplier.name}</span>
                <span class="s-v" data-val={topSupplier.cost}><Ticker value={topSupplier.cost} /> <span class="cur">د.ع</span></span>
                <span class="muted tiny">{fmtNum(topSupplier.models.size)} موديل — {fmtNum(topSupplier.qty)} قطعة</span>
              </Glass>
              <Glass class="stat">
                <span class="s-ic"><Icon name="sparkle" size={16} color="var(--burgundy)" /></span>
                <span class="sl">وفاء الزبونات</span>
                <span class="bold small">{fmtNum(tstCount)} شهادة</span>
                {#if tstAvg}<span class="s-v gold">{tstAvg.toFixed(1)} ★</span>{/if}
                <span class="muted tiny">{fmtNum(refCount)} إحالة · {fmtNum(waitCount)} بانتظار</span>
              </Glass>
            </div>
          {/if}
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  /* اسم خاص بالمكوّن: `:global(.hero)` ليست محصورة، وكانت تعيد ضبط حشوة رأس كل شاشة أخرى */
  :global(.store-hero) {
    padding: 15px 16px;
    display: flex; flex-direction: column; gap: 12px;
    position: relative; overflow: hidden;
    background: linear-gradient(158deg, rgba(255, 255, 255, 0.94) 0%, rgba(181, 73, 91, 0.07) 62%, rgba(201, 161, 90, 0.13) 100%) !important;
    border-color: rgba(181, 73, 91, 0.18) !important;
  }
  :global(.store-hero)::before {
    content: ''; position: absolute;
    inset-block-start: 0; inset-inline: 0; height: 2px;
    background: linear-gradient(90deg, transparent 4%, var(--gold) 50%, transparent 96%);
    opacity: 0.8;
  }
  .sh-top { display: flex; align-items: center; gap: 12px; }
  .sh-logo {
    width: 48px; height: 48px; border-radius: 15px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    box-shadow: 0 0 0 1px rgba(201, 161, 90, 0.5), 0 8px 18px rgba(122, 46, 58, 0.26);
  }
  .sh-id { flex: 1; min-width: 0; }
  .sh-id :global(.h1) { margin: 0; }
  .sh-sub { font-size: 11.5px; font-weight: 700; color: var(--taupe); margin-top: 2px; }
  .sh-meta {
    display: flex; flex-wrap: wrap; gap: 6px;
    border-top: 1px dashed rgba(201, 161, 90, 0.5);
    padding-top: 10px;
  }
  .sh-chip {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10.5px; font-weight: 800; color: var(--taupe);
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    border-radius: 999px; padding: 3px 10px;
    font-variant-numeric: tabular-nums;
  }

  /* الأرقام الكبيرة: الأولى أعرض — البصمة لا شبكة متساوية */
  .hero-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  :global(.hs) {
    grid-column: span 1;
    padding: 12px 13px;
    display: flex; flex-direction: column; gap: 3px; min-width: 0;
  }
  :global(.hs-main) { grid-column: span 2; }
  .hs-l { font-size: 10.5px; font-weight: 800; color: var(--taupe); }
  .hs-v {
    font-weight: 900; font-size: 17px; color: var(--ink);
    display: flex; align-items: baseline; gap: 3px;
    font-variant-numeric: tabular-nums;
  }
  :global(.hs-main) .hs-v { font-size: 22px; }
  .hs-v.gold { color: #8a6a35; }
  .hs-s { font-size: 10px; font-weight: 700; color: var(--taupe); }

  /* عنوان القسم = زرّ الطيّ نفسه */
  .sec-t {
    width: 100%;
    display: flex; align-items: center; gap: 8px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; text-align: right;
    padding: 6px 2px; margin: 2px 0 8px;
  }
  .st-ic {
    width: 26px; height: 26px; border-radius: 9px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft);
  }
  .st-t { flex: 1; font-weight: 900; font-size: 13px; color: var(--ink); letter-spacing: 0.2px; }
  .st-badge {
    font-size: 10px; font-weight: 800; color: var(--burgundy);
    background: rgba(181, 73, 91, 0.1);
    border-radius: 999px; padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .st-chev { flex: none; display: inline-flex; transition: transform 0.22s ease; transform: rotate(90deg); }
  .st-chev.open { transform: rotate(-90deg); }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .grid.two { grid-template-columns: 1fr 1fr; }
  :global(.stat) {
    padding: 11px 12px;
    display: flex; flex-direction: column; gap: 2px; min-width: 0;
  }
  .s-ic {
    width: 30px; height: 30px; border-radius: 10px; margin-bottom: 3px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft);
  }
  .sl { font-size: 10.5px; font-weight: 700; color: var(--taupe); }
  .s-v {
    font-weight: 800; font-size: 14px; color: var(--ink);
    display: flex; align-items: baseline; gap: 3px;
    font-variant-numeric: tabular-nums;
  }
  .s-v.gold { color: #8a6a35; }
  .s-v.good { color: var(--good); }
  .s-v.bad { color: var(--burgundy); }
  .cur { font-size: 10.5px; font-weight: 700; color: var(--taupe); }

  /* شريط توزيع الإيراد */
  :global(.flow) { margin-top: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .fl-h { display: flex; align-items: center; justify-content: space-between; }
  .fl-bar {
    display: flex; height: 10px; border-radius: 999px; overflow: hidden;
    background: rgba(156, 123, 107, 0.14);
  }
  .fl-seg { height: 100%; transition: width 0.5s ease; }
  .fl-seg.profit { background: linear-gradient(90deg, var(--gold), #a4803e); }
  .fl-seg.rest { background: rgba(156, 123, 107, 0.28); }
  .fl-legend { display: flex; flex-wrap: wrap; gap: 5px 12px; }
  .lg { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: var(--taupe); }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .dot.profit { background: linear-gradient(150deg, var(--gold), #a4803e); }
  .dot.rest { background: rgba(156, 123, 107, 0.35); }
  .dot.gold { background: var(--burgundy); }

  /* عدّاد نسبة التصريف */
  :global(.meter) { margin-top: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 7px; }
  :global(.meter.warn) { border-color: rgba(230, 145, 56, 0.35) !important; }
  .mt-h { display: flex; align-items: center; justify-content: space-between; }
  .mt-l { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 800; color: var(--ink); }
  .mt-n { font-size: 14px; font-weight: 900; color: var(--burgundy-deep); font-variant-numeric: tabular-nums; }
  .mt-n.warn { color: #9a5b16; }
  .mt-bar { height: 8px; border-radius: 999px; background: rgba(156, 123, 107, 0.14); overflow: hidden; }
  .mt-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--burgundy), var(--gold)); transition: width 0.5s ease; }
  .mt-s { font-size: 10.5px; font-weight: 700; color: var(--taupe); }

  /* آخر الأشهر: أعمدة حقيقية */
  :global(.months) { margin-top: 9px; padding: 12px 14px; display: flex; flex-direction: column; gap: 7px; }
  .mh-h { display: flex; justify-content: space-between; }
  .mh-row { display: flex; align-items: center; gap: 8px; }
  .mh-l { flex: none; width: 78px; font-size: 10.5px; font-weight: 700; color: var(--taupe); }
  .mh-bar { flex: 1; min-width: 0; height: 8px; border-radius: 999px; background: rgba(156, 123, 107, 0.12); overflow: hidden; }
  .mh-fill { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--burgundy)); transition: width 0.5s ease; }
  .mh-v { flex: none; min-width: 60px; text-align: left; font-size: 10.5px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* رتّب الأنواع */
  :global(.rank) { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .rk-h { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 800; color: #8a6a35; }
  .rk-row { display: flex; align-items: center; gap: 9px; }
  .rk-n {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 900; color: var(--taupe);
    background: rgba(156, 123, 107, 0.12);
    font-variant-numeric: tabular-nums;
  }
  .rk-n.first { background: linear-gradient(150deg, var(--gold), #a4803e); color: #fff; }
  .rk-name { flex: 1; min-width: 0; font-size: 12px; font-weight: 800; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rk-v { flex: none; font-size: 12px; font-weight: 900; color: #8a6a35; font-variant-numeric: tabular-nums; }

  :global(.vault-row), :global(.arch-row), :global(.last) {
    margin-top: 9px; padding: 12px 14px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .vr-l { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 800; color: var(--taupe); }
  .bold { font-weight: 800; }
</style>
