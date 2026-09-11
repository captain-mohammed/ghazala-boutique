<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, allSettings, getSetting, WOMENS_TYPES, modelGroupKey } from '../db.js';
  import Glass from '../components/Glass.svelte';
  import { fmtIQD, fmtNum, fmtDate, startOfToday, daysAgoStart, lastSaleMap, salePieces, MONTHS_AR, shelfAgeDays, stockArrival } from '../utils.js';

  let products = $state([]);
  let sales = $state([]);
  let showReturned = $state(false);
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
      const [p, s, e, c] = await Promise.all([db.products.toArray(), db.sales.toArray(), db.expenses.toArray(), getSetting('monthClosing', [])]);
      if (!alive) return;
      products = p;
      sales = s;
      expenses = e;
      closings = Array.isArray(c) ? c : [];
    };
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  onMount(async () => { settings = await allSettings(); });

  const from = $derived(period === 'today' ? startOfToday() : period === 'week' ? daysAgoStart(6) : period === 'month' ? daysAgoStart(29) : new Date(0));
  const inPeriod = $derived(sales.filter((s) => s.status !== 'returned' && new Date(s.date) >= from));
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

  /* Best sellers in period */
  const best = $derived.by(() => {
    const m = new Map();
    for (const s of inPeriod) for (const it of s.items) {
      const cur = m.get(it.sku) || { sku: it.sku, name: it.name, color: it.color || '', size: it.size || '', qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.qty * it.price;
      m.set(it.sku, cur);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
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

  /* نفد — same rule as the dashboard: only models whose CURRENT shelf stock
     is zero, and only the specific colors/sizes that hit zero. One card per
     model listing its holes. (The old «كمية قليلة 1-3» warning is retired.) */
  const holes = $derived.by(() => {
    const map = new Map();
    for (const p of products) {
      if ((p.qty || 0) > 0) continue;
      const k = modelGroupKey(p);
      const cur = map.get(k) || { key: k, name: p.name, items: [] };
      cur.items.push(p);
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

  /* ---- Sell-through rate: % of each model sold since it arrived ----
     Per MODEL: every color × size card of the same name+category counts
     together (a 4-color model isn't 4 strangers). arrived = what's on the
     shelf now + everything ever sold of it. */
  const sellThrough = $derived.by(() => {
    const soldQty = new Map();
    for (const s of sales) {
      if (s.status === 'returned') continue;
      for (const it of s.items) soldQty.set(it.sku, (soldQty.get(it.sku) || 0) + (Number(it.qty) || 0));
    }
    const map = new Map();
    for (const p of products) {
      const k = modelGroupKey(p);
      const cur = map.get(k) || { key: k, name: p.name, color: p.color || '', size: p.size || '', sold: 0, arrived: 0 };
      cur.sold += soldQty.get(p.sku) || 0;
      cur.arrived += (soldQty.get(p.sku) || 0) + (p.qty || 0);
      map.set(k, cur);
    }
    return [...map.values()]
      .filter((x) => x.arrived > 0)
      .map((x) => ({ ...x, rate: Math.round((x.sold / x.arrived) * 100) }))
      .sort((a, b) => b.rate - a.rate);
  });
  const movingFast = $derived(sellThrough.filter((x) => x.rate >= 60 && x.sold >= 3).slice(0, 4));
  const movingSlow = $derived(sellThrough.filter((x) => x.rate < 25 && x.arrived >= 3).slice(-4).reverse());
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

  {#if best.length}
    <Glass class="rise" style="animation-delay:0.15s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="flame" size={17} color="var(--burgundy)" /> الأكثر مبيعاً</h2>
      <div class="stack" style="gap:8px">
        {#each best as b, i (b.sku)}
          {@const ph = products.find((p) => p.sku === b.sku)?.photo}
          {@const bp = products.find((p) => p.sku === b.sku)}
          <div class="brow pop" style="animation-delay:{0.2 + i * 0.05}s">
            <span class="rank">{i + 1}</span>
            <span class="r-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
            <div class="a-body">
              {#if bp && (bp.type || bp.typeSub || bp.typeSub2 || bp.typeSub3)}
                <div class="bold small">{[bp.type, bp.typeSub, bp.typeSub2, bp.typeSub3].filter(Boolean).join(' - ')}</div>
              {/if}
              <VariantBits dense variants={[{ color: b.color, size: b.size }]} />
              <div class="muted small">{fmtNum(b.qty)} قطعة</div>
            </div>
            <div class="money small">{fmtIQD(b.revenue)}</div>
          </div>
        {/each}
      </div>
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

  {#if sellThrough.length}
    <Glass class="rise" style="animation-delay:0.2s; padding:16px">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="flame" size={17} color="var(--burgundy)" /> نسبة التصريف</h2>
      <p class="muted small" style="margin:0 0 10px">كم٪ من كل موديل انباع منذ وصل — مقياس التاجر الحقيقي.</p>
      {#if movingFast.length}
        <div class="st-head good">يدور بسرعة — ما يلبث على الرف</div>
        {#each movingFast as x (x.key)}
          {@const ph = products.find((p) => modelGroupKey(p) === x.key && p.photo)?.photo}
          {@const xp = products.find((p) => modelGroupKey(p) === x.key)}
          <div class="brow" style="margin-bottom:6px">
            <span class="r-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
            <div class="a-body">
              {#if xp && (xp.type || xp.typeSub || xp.typeSub2 || xp.typeSub3)}
                <div class="bold small">{[xp.type, xp.typeSub, xp.typeSub2, xp.typeSub3].filter(Boolean).join(' - ')}</div>
              {/if}
              <VariantBits dense variants={[{ color: x.color, size: x.size }]} />
              <div class="muted small">انباع {fmtNum(x.sold)} من {fmtNum(x.arrived)}</div>
            </div>
            <span class="qbadge hot">{x.rate}%</span>
          </div>
        {/each}
      {/if}
      {#if movingSlow.length}
        <div class="st-head slow">يتثاقل — فكّري بعرض أو تصفية</div>
        {#each movingSlow as x (x.key)}
          {@const ph = products.find((p) => modelGroupKey(p) === x.key && p.photo)?.photo}
          {@const xp = products.find((p) => modelGroupKey(p) === x.key)}
          <div class="brow" style="margin-bottom:6px">
            <span class="r-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
            <div class="a-body">
              {#if xp && (xp.type || xp.typeSub || xp.typeSub2 || xp.typeSub3)}
                <div class="bold small">{[xp.type, xp.typeSub, xp.typeSub2, xp.typeSub3].filter(Boolean).join(' - ')}</div>
              {/if}
              <VariantBits dense variants={[{ color: x.color, size: x.size }]} />
              <div class="muted small">انباع {fmtNum(x.sold)} من {fmtNum(x.arrived)}</div>
            </div>
            <span class="qbadge cold">{x.rate}%</span>
          </div>
        {/each}
      {/if}
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

  {#if holes.length}
    <Glass class="rise" style="animation-delay:0.2s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="alert" size={17} color="var(--warn)" /> نفد من المخزون ({holes.length})</h2>
      <p class="muted small" style="margin:0 0 10px">مقاسات وألوان محددة صارت صفر — حان وقت الاستلام.</p>
      <div class="stack" style="gap:8px">
        {#each holes as h (h.key)}
          <div class="brow">
            <span class="r-thumb">{#if h.items.find((p) => p.photo)}<img src={h.items.find((p) => p.photo).photo} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
            <div class="a-body">
              {#if h.items[0].type || h.items[0].typeSub || h.items[0].typeSub2 || h.items[0].typeSub3}
                <div class="bold small">{[h.items[0].type, h.items[0].typeSub, h.items[0].typeSub2, h.items[0].typeSub3].filter(Boolean).join(' - ')}</div>
              {/if}
              <VariantBits dense variants={h.items.map((p) => ({ color: p.color, size: p.size }))} />
            </div>
            <span class="qbadge low">نفد</span>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}

  {#if dead.length}
    <Glass class="rise" style="animation-delay:0.25s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="clock" size={17} color="var(--burgundy)" /> مخزون راكد ({dead.length})</h2>
      <p class="muted small" style="margin:0 0 10px">كل قطعة تُحسب بأيامها منذ وصلت الرف — والعدد الذي تختارينه في الإعدادات هو المتصفّر.</p>
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
    </Glass>
  {/if}

  {#if totals.returned > 0}
    <Glass class="rise" style="animation-delay:0.3s; padding:14px 16px">
      <button class="ret-toggle" onclick={() => (showReturned = !showReturned)}>
        <span class="muted"><Icon name="undo" size={15} /> مبيعات راجع (كل الفترات)</span>
        <span class="ret-side"><span class="money">{totals.returned}</span><i class="chev" class:open={showReturned}></i></span>
      </button>
      {#if showReturned}
        <div class="stack" style="gap:8px; margin-top:10px">
          {#each returnedSales as s (s.id)}
            {@const ph = products.find((p) => p.sku === s.items?.[0]?.sku)?.photo}
            <div class="brow">
              <span class="r-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
              <div class="a-body">
                <div class="small bold">{s.customer || 'بدون اسم'}{s.phone ? ` - ${s.phone}` : ''}</div>
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
  .rank {
    flex: none;
    width: 26px; height: 26px;
    border-radius: 9px;
    background: linear-gradient(150deg, var(--gold), #b0894a);
    color: #fff;
    font-size: 12.5px;
    font-weight: 800;
    display: flex; align-items: center; justify-content: center;
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
  .qbadge.low { background: rgba(192, 127, 58, 0.15); color: var(--warn); }
  .qbadge.hot { background: rgba(78, 138, 95, 0.15); color: var(--good); }
  .qbadge.cold { background: rgba(122, 46, 58, 0.12); color: var(--burgundy-deep); }

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
  .st-head {
    font-size: 11.5px; font-weight: 800;
    padding: 4px 2px 6px;
  }
  .st-head.good { color: var(--good); }
  .st-head.slow { color: var(--warn); margin-top: 6px; }
</style>
