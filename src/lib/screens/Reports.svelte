<script>
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, allSettings, getSetting, WOMENS_TYPES, modelGroupKey, loadProducts } from '../db.js';
  import Glass from '../components/Glass.svelte';
  import { fmtIQD, fmtNum, fmtDate, startOfToday, daysAgoStart, lastSaleMap, salePieces, MONTHS_AR, shelfAgeDays, stockArrival, baghdadWeekday, baghdadDayPart } from '../utils.js';

  let products = $state([]);
  let sales = $state([]);
  let showReturned = $state(false);
  let showDead = $state(false);
  let expenses = $state([]);
  let closings = $state([]);
  let settings = $state(null);
  let period = $state('today');

  const PERIODS = [
    { id: 'today', label: 'اليوم' },
    { id: 'week', label: '7 أيام' },
    { id: 'month', label: '30 يوم' },
    { id: 'all', label: 'الكل' }
  ];

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, e, c, st] = await Promise.all([loadProducts(), db.sales.toArray(), db.expenses.toArray(), getSetting('monthClosing', []), allSettings()]);
      if (!alive) return;
      products = p;
      sales = s;
      expenses = e;
      closings = Array.isArray(c) ? c : [];
      /* حد الرکود حيّ مع كل جلب — تغييره في الإعدادات ينعكس دون مغادرة الصفحة */
      settings = st;
    };
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  const from = $derived(period === 'today' ? startOfToday() : period === 'week' ? daysAgoStart(6) : period === 'month' ? daysAgoStart(29) : new Date(0));
  const inPeriod = $derived(sales.filter((s) => s.status !== 'returned' && new Date(s.date) >= from));

  /* خرائط بحث تُبنى مرة واحدة — كانت كل صفحة تستدعي products.find داخل حلقة
     العرض (صفوف × منتجات)، فمع ٣٠٠ موديل صار العرض يبطؤ بلا داعٍ. */
  const prodBySku = $derived.by(() => {
    const m = new Map();
    for (const p of products) m.set(p.sku, p);
    return m;
  });
  const returnedSales = $derived(sales.filter((s) => s.status === 'returned').sort((a, b) => new Date(b.date) - new Date(a.date)));

  const totals = $derived({
    count: inPeriod.length,
    revenue: inPeriod.reduce((a, s) => a + s.subtotal, 0),
    profit: inPeriod.reduce((a, s) => a + s.profit, 0),
    fees: inPeriod.reduce((a, s) => a + (s.deliveryFee || 0), 0),
    expenses: expenses.filter((e) => new Date(e.date) >= from).reduce((a, e) => a + (Number(e.amount) || 0), 0),
    returned: sales.filter((s) => s.status === 'returned').length
  });

  /* Daily bars for last 14 days */
  const daily = $derived.by(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = daysAgoStart(i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const total = sales
        .filter((s) => s.status !== 'returned' && new Date(s.date) >= d && new Date(s.date) < next)
        .reduce((a, s) => a + (s.subtotal ?? s.total), 0);
      days.push({ d, total });
    }
    return days;
  });
  const maxDaily = $derived(Math.max(1, ...daily.map((x) => x.total)));

  const DAY_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayName = (d) => DAY_AR[d.getDay()];

  /* ---- ساعات الذروة: متى تبيع فعلاً؟ (كل المبيعات غير المرتجعة، بتوقيت بغداد) ---- */
  const peak = $derived.by(() => {
    const byDay = Array(7).fill(0);
    const parts = { 'الصباح': 0, 'الظهر': 0, 'المساء': 0, 'الليل': 0 };
    let any = false;
    for (const s of sales) {
      if (s.status === 'returned') continue;
      any = true;
      byDay[baghdadWeekday(s.date)] += salePieces(s);
      parts[baghdadDayPart(s.date)] += salePieces(s);
    }
    if (!any) return null;
    const maxDay = Math.max(1, ...byDay);
    const bestDayQty = Math.max(...byDay);
    const bestPart = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
    return { byDay, maxDay, bestDay: DAY_AR[byDay.indexOf(bestDayQty)], bestDayQty, bestPart: bestPart[0], bestPartQty: bestPart[1] };
  });

  /* مخزون راكد — counted from when the current shelf stock ARRIVED (creation /
     last stock-in / restock), never from the previous sales cycle. An item
     sitting for hours shows 0 يوم and only crosses the threshold after the
     days chosen in الإعدادات. One card per model (colors & sizes merged). */
  const dead = $derived.by(() => {
    if (!settings) return [];
    const lm = lastSaleMap(sales.filter((s) => s.status !== 'returned'));
    const cutoff = daysAgoStart(settings.deadStockDays ?? 30).getTime();
    const map = new Map();
    for (const p of products) {
      if ((p.qty || 0) <= 0) continue;
      const since = stockArrival(p);
      const lastSold = lm.get(p.sku) ? new Date(lm.get(p.sku)).getTime() : 0;
      if (lastSold > since) continue; // sold more recently than it arrived — it moves
      if (since > cutoff) continue;   // hasn't sat long enough yet
      const k = modelGroupKey(p);
      const cur = map.get(k) || { key: k, name: p.name, color: p.color || '', size: p.size || '', items: [], qty: 0 };
      cur.items.push(p);
      cur.qty += p.qty || 0;
      map.set(k, cur);
    }
    return [...map.values()];
  });

  const stockValue = $derived(products.reduce((a, p) => a + (p.qty || 0) * (p.cost || 0), 0));

  /* ---- Profit by type (بوت vs سلامبر vs موال vs كعب) ----
     Type lives on the product; older sale lines carry the name too, so we
     match by name keyword for legacy sales whose SKU no longer exists. */
  const byType = $derived.by(() => {
    const typeBySku = new Map();
    for (const p of products) typeBySku.set(p.sku, p.type || (p.category !== 'نسائية' ? p.category : ''));
    const guess = (sku, name) => {
      if (typeBySku.has(sku)) return typeBySku.get(sku) || 'غير محدد';
      const n = String(name || '');
      return WOMENS_TYPES.find((t) => n.includes(t)) || 'غير محدد';
    };
    const m = new Map();
    for (const s of inPeriod) for (const it of s.items) {
      const t = guess(it.sku, it.name);
      const cur = m.get(t) || { type: t, qty: 0, revenue: 0, profit: 0 };
      cur.qty += it.qty;
      cur.revenue += it.price * it.qty;
      cur.profit += (it.price - (it.cost || 0)) * it.qty;
      m.set(t, cur);
    }
    return [...m.values()].sort((a, b) => b.profit - a.profit);
  });
  const bestType = $derived(byType.find((t) => t.type !== 'غير محدد'));
  const typeMax = $derived(Math.max(1, ...byType.map((t) => t.profit)));
  const typeRevenue = $derived(byType.reduce((a, t) => a + t.revenue, 0));

</script>

<div class="stack" style="gap:12px">
  <div class="row noscroll" style="gap:8px; overflow-x:auto; padding-bottom:2px">
    {#each PERIODS as p (p.id)}
      <button class="chip" class:on={period === p.id} onclick={() => (period = p.id)}>{p.label}</button>
    {/each}
  </div>

  <section class="cards">
    <Glass class="stat rise" style="animation-delay:0s; padding:13px 15px; display:flex; flex-direction:column; gap:3px"><span class="muted small">الإيرادات</span><div class="big"><Ticker value={totals.revenue} /> <span class="cur">د.ع</span></div></Glass>
    <Glass class="stat rise" style="animation-delay:0.05s; padding:13px 15px; display:flex; flex-direction:column; gap:3px"><span class="muted small">صافي الربح</span><div class="big gold"><Ticker value={totals.profit - totals.expenses} /> <span class="cur">د.ع</span></div><span class="muted tiny">بعد خصم {fmtIQD(totals.expenses)} مصاريف</span></Glass>
    <Glass class="stat rise" style="animation-delay:0.1s; padding:13px 15px; display:flex; flex-direction:column; gap:3px"><span class="muted small">عدد العمليات</span><div class="big"><Ticker value={totals.count} /></div></Glass>
    <Glass class="stat rise" style="animation-delay:0.15s; padding:13px 15px; display:flex; flex-direction:column; gap:3px"><span class="muted small">قيمة المخزون</span><div class="big"><Ticker value={stockValue} /> <span class="cur">د.ع</span></div></Glass>
  </section>

  <Glass class="chart rise" style="animation-delay:0.1s; padding:16px">
    <h2 class="h2">مبيعات آخر 14 يوم</h2>
    <div class="bars">
      {#each daily as day, i (i)}
        <div class="bar-wrap" title="{dayName(day.d)}: {fmtIQD(day.total)}">
          <div class="bar" style="height:{Math.max(4, (day.total / maxDaily) * 100)}%; animation-delay:{i * 0.04}s"></div>
          <span class="bar-label muted">{day.d.getDate()}</span>
        </div>
      {/each}
    </div>
  </Glass>

  {#if peak}
    <Glass class="rise" style="animation-delay:0.12s; padding:16px">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="clock" size={17} color="var(--gold)" /> وقت الذروة</h2>
      <p class="muted small" style="margin:0 0 10px">متى يبيع بوتيكك فعلاً — كل المبيعات منذ البداية، بتوقيت بغداد.</p>
      <div class="peak-days">
        {#each peak.byDay as qty, i (i)}
          <div class="pk-day">
            <i class="pk-bar" style="height:{Math.max(4, (qty / peak.maxDay) * 44)}px" class:best={qty > 0 && qty === peak.bestDayQty}></i>
            <span class="pk-lab">{DAY_AR[i].slice(0, 3)}</span>
          </div>
        {/each}
      </div>
      <div class="peak-line"><Icon name="flame" size={12} color="var(--burgundy)" /> أكثر يوم بيعاً: <b>{peak.bestDay}</b> — {fmtNum(peak.bestDayQty)} قطعة</div>
      <div class="peak-line"><Icon name="clock" size={12} color="var(--taupe)" /> ذروة الساعات: <b>{peak.bestPart}</b> — {fmtNum(peak.bestPartQty)} قطعة</div>
    </Glass>
  {/if}

  {#if byType.length && period !== 'today'}
    <Glass class="rise" style="animation-delay:0.18s; padding:16px">
      <div class="row" style="justify-content:space-between; margin-bottom:10px">
        <h2 class="h2"><Icon name="chart" size={17} color="var(--gold)" /> الربح حسب النوع</h2>
        {#if bestType}<span class="tiny bold" style="color:var(--gold)">زيّدي من {bestType.type} 💛</span>{/if}
      </div>
      <div class="stack" style="gap:10px">
        {#each byType as t (t.type)}
          <div class="tp-row">
            <div class="row" style="justify-content:space-between; margin-bottom:5px">
              <span class="bold small">{t.type} <span class="muted" style="font-weight:600">- {fmtNum(t.qty)} قطعة</span></span>
              <span class="money small" style="color:{t.profit >= 0 ? 'var(--good)' : 'var(--burgundy)'}">{fmtIQD(t.profit)}</span>
            </div>
            <div class="tp-bar"><i style="width:{Math.max(3, (t.profit / typeMax) * 100)}%"></i></div>
            <div class="muted tiny" style="margin-top:4px">{typeRevenue ? Math.round((t.revenue / typeRevenue) * 100) : 0}% من الإيراد — {fmtIQD(t.revenue)}</div>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}

  {#if closings.length}
    <Glass class="rise" style="animation-delay:0.22s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="list" size={17} color="var(--gold)" /> دفتر الشهر</h2>
      <div class="stack" style="gap:8px">
        {#each [...closings].reverse() as c (c.month)}
          <div class="brow">
            <div class="a-body">
              <div class="bold small">{MONTHS_AR[+c.month.split('-')[1] - 1]} {c.month.split('-')[0]}</div>
              <div class="muted tiny">{fmtNum(c.count)} عملية - {fmtNum(c.pieces)} قطعة - {fmtNum(c.modelsAdded)} موديل وصل</div>
            </div>
            <div style="text-align:left">
              <div class="money" style="color:var(--gold); font-size:13.5px">{fmtIQD(c.net)}</div>
              <div class="muted tiny">صافي بعد المصاريف</div>
            </div>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}

  {#if dead.length}
    <Glass class="rise" style="animation-delay:0.25s; padding:14px 16px">
      <button class="ret-toggle" onclick={() => (showDead = !showDead)}>
        <span class="muted"><Icon name="clock" size={15} /> مخزون راكد <span class="cnt">({fmtNum(dead.length)})</span></span>
        <span class="ret-side"><i class="chev" class:open={showDead}></i></span>
      </button>
      {#if showDead}
      <p class="muted small" style="margin:8px 0 10px">كل قطعة تُحسب بأيامها منذ وصلت الرف — والعدد الذي تختارينه في الإعدادات هو المتصفّر.</p>
      <div class="stack" style="gap:8px">
        {#each dead.slice(0, 8) as d (d.key)}
          <div class="brow">
            <span class="r-thumb">{#if d.items.find((p) => p.photo)}<img src={d.items.find((p) => p.photo).photo} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
            <div class="a-body">
              <!-- عنوان السلسلة: النوع وتفصيله بجانب الصورة -->
              {#if d.items[0].type || d.items[0].typeSub || d.items[0].typeSub2 || d.items[0].typeSub3}
                <div class="bold small">{[d.items[0].type, d.items[0].typeSub, d.items[0].typeSub2, d.items[0].typeSub3].filter(Boolean).join(' - ')}</div>
              {/if}
              <VariantBits dense variants={d.items.map((p) => ({ color: p.color, size: p.size }))} />
              <!-- كل قطعة بأيامها الخاصة -->
              <div class="muted tiny">{d.items.map((p) => `${[p.color, p.size].filter(Boolean).join(' ')}: ${fmtNum(shelfAgeDays(p))} يوم`).join(' - ')}</div>
            </div>
            <span class="qbadge">{fmtNum(d.qty)}</span>
          </div>
        {/each}
      </div>
      {/if}
    </Glass>
  {/if}

  {#if totals.returned > 0}
    <Glass class="rise" style="animation-delay:0.3s; padding:14px 16px">
      <button class="ret-toggle" onclick={() => (showReturned = !showReturned)}>
        <span class="muted"><Icon name="undo" size={15} /> رواجع المبيعات (كل الفترات)</span>
        <span class="ret-side"><span class="money">{totals.returned}</span><i class="chev" class:open={showReturned}></i></span>
      </button>
      {#if showReturned}
        <div class="stack" style="gap:8px; margin-top:10px">
          {#each returnedSales.slice(0, 20) as s (s.id)}
            {@const ph = prodBySku.get(s.items?.[0]?.sku)?.photo}
            <div class="brow">
              <span class="r-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
              <div class="a-body">
                <div class="small bold">{s.customerName || 'بدون اسم'}{s.customerPhone ? ` - ${s.customerPhone}` : ''}</div>
                <div class="muted tiny">{fmtDate(s.date)} - {fmtNum(salePieces(s))} قطعة</div>
              </div>
              <span class="money">{fmtIQD(s.subtotal)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Glass>
  {/if}
</div>

<style>
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .big { font-size: 20px; font-weight: 800; color: var(--ink); display: flex; align-items: baseline; gap: 4px; }
  .big .cur { font-size: 11px; color: var(--taupe); font-weight: 700; }
  .big.gold { color: var(--gold); }

  .bars { display: flex; align-items: flex-end; gap: 5px; height: 130px; margin-top: 14px; }
  .bar-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; justify-content: flex-end; }
  .bar {
    width: 100%;
    max-width: 26px;
    border-radius: 7px 7px 3px 3px;
    background: linear-gradient(180deg, var(--burgundy), rgba(122, 46, 58, 0.65));
    animation: grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
    transform-origin: bottom;
    min-height: 4px;
  }
  @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .bar-label { font-size: 9px; }

  .ret-toggle {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: none; border: none; padding: 0; font-family: inherit; cursor: pointer;
  }
  .ret-side { display: flex; align-items: center; gap: 8px; }
  .cnt { color: var(--burgundy-deep); font-weight: 800; font-variant-numeric: tabular-nums; }
  .chev {
    width: 8px; height: 8px;
    border-inline-end: 2px solid var(--taupe); border-bottom: 2px solid var(--taupe);
    transform: rotate(-45deg); transition: transform 0.2s ease;
  }
  .chev.open { transform: rotate(45deg); }

  .brow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
  .r-thumb {
    flex: none;
    width: 44px; height: 44px;
    border-radius: 11px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--line);
  }
  .r-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .a-body { flex: 1; min-width: 0; }
  .qbadge {
    min-width: 30px;
    text-align: center;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(122, 46, 58, 0.08);
    color: var(--ink-2);
    font-weight: 800;
    font-size: 12.5px;
  }

  .tp-row { padding: 2px 0; }
  .tp-bar {
    height: 8px;
    border-radius: 999px;
    background: rgba(122, 46, 58, 0.08);
    overflow: hidden;
  }
  .tp-bar i {
    display: block; height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--burgundy), var(--gold));
    animation: grow-x 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
    transform-origin: right;
  }
  @keyframes grow-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  /* وقت الذروة: أعمدة الأسبوع بخط غزالة الذهبي */
  .peak-days { display: flex; justify-content: space-between; align-items: flex-end; gap: 6px; margin-bottom: 10px; }
  .pk-day { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
  .pk-bar { width: 100%; max-width: 26px; border-radius: 6px 6px 3px 3px; background: rgba(122, 46, 58, 0.14); display: block; }
  .pk-bar.best { background: linear-gradient(180deg, var(--gold), #a4803e); box-shadow: 0 2px 8px rgba(164, 128, 62, 0.35); }
  .pk-lab { font-size: 9.5px; font-weight: 800; color: var(--taupe); }
  .peak-line { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink-2); padding: 2px 0; flex-wrap: wrap; }
</style>
