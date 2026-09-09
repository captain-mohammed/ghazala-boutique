<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import { db, allSettings } from '../db.js';
  import { fmtIQD, fmtNum, startOfToday, daysAgoStart, lastSaleMap } from '../utils.js';

  let products = $state([]);
  let sales = $state([]);
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
      const [p, s] = await Promise.all([db.products.toArray(), db.sales.toArray()]);
      if (!alive) return;
      products = p;
      sales = s;
    };
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  onMount(async () => { settings = await allSettings(); });

  const from = $derived(period === 'today' ? startOfToday() : period === 'week' ? daysAgoStart(6) : period === 'month' ? daysAgoStart(29) : new Date(0));
  const inPeriod = $derived(sales.filter((s) => s.status !== 'returned' && new Date(s.date) >= from));

  const totals = $derived({
    count: inPeriod.length,
    revenue: inPeriod.reduce((a, s) => a + s.total, 0),
    profit: inPeriod.reduce((a, s) => a + s.profit, 0),
    fees: inPeriod.reduce((a, s) => a + (s.deliveryFee || 0), 0),
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
        .reduce((a, s) => a + s.total, 0);
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
      const cur = m.get(it.sku) || { sku: it.sku, name: it.name, qty: 0, revenue: 0 };
      cur.qty += it.qty;
      cur.revenue += it.qty * it.price;
      m.set(it.sku, cur);
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  });

  const dead = $derived.by(() => {
    if (!settings) return [];
    const lm = lastSaleMap(sales.filter((s) => s.status !== 'returned'));
    const cutoff = daysAgoStart(settings.deadStockDays ?? 30);
    return products.filter((p) => p.qty > 0 && (!lm.get(p.sku) || new Date(lm.get(p.sku)) < cutoff));
  });

  const low = $derived(products.filter((p) => p.qty > 0 && p.qty <= (settings?.lowStockThreshold ?? 3)));

  const stockValue = $derived(products.reduce((a, p) => a + (p.qty || 0) * (p.cost || 0), 0));
</script>

<div class="stack" style="gap:12px">
  <div class="row noscroll" style="gap:8px; overflow-x:auto; padding-bottom:2px">
    {#each PERIODS as p (p.id)}
      <button class="chip" class:on={period === p.id} onclick={() => (period = p.id)}>{p.label}</button>
    {/each}
  </div>

  <section class="cards">
    <div class="stat glass rise"><span class="muted small">الإيرادات</span><div class="big"><Ticker value={totals.revenue} /> <span class="cur">د.ع</span></div></div>
    <div class="stat glass rise" style="animation-delay:0.05s"><span class="muted small">صافي الربح</span><div class="big gold"><Ticker value={totals.profit} /> <span class="cur">د.ع</span></div></div>
    <div class="stat glass rise" style="animation-delay:0.1s"><span class="muted small">عدد العمليات</span><div class="big"><Ticker value={totals.count} /></div></div>
    <div class="stat glass rise" style="animation-delay:0.15s"><span class="muted small">قيمة المخزون</span><div class="big"><Ticker value={stockValue} /> <span class="cur">د.ع</span></div></div>
  </section>

  <section class="glass chart rise" style="animation-delay:0.1s">
    <h2 class="h2">مبيعات آخر 14 يوم</h2>
    <div class="bars">
      {#each daily as day, i (i)}
        <div class="bar-wrap" title="{dayName(day.d)}: {fmtIQD(day.total)}">
          <div class="bar" style="height:{Math.max(4, (day.total / maxDaily) * 100)}%; animation-delay:{i * 0.04}s"></div>
          <span class="bar-label muted">{day.d.getDate()}</span>
        </div>
      {/each}
    </div>
  </section>

  {#if best.length}
    <section class="glass rise" style="animation-delay:0.15s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="flame" size={17} color="var(--burgundy)" /> الأكثر مبيعاً</h2>
      <div class="stack" style="gap:8px">
        {#each best as b, i (b.sku)}
          <div class="brow pop" style="animation-delay:{0.2 + i * 0.05}s">
            <span class="rank">{i + 1}</span>
            <div class="a-body">
              <div class="bold small">{b.name}</div>
              <div class="muted small">{fmtNum(b.qty)} قطعة</div>
            </div>
            <div class="money small">{fmtIQD(b.revenue)}</div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if low.length}
    <section class="glass rise" style="animation-delay:0.2s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="alert" size={17} color="var(--warn)" /> كمية قليلة ({low.length})</h2>
      <div class="stack" style="gap:8px">
        {#each low as p (p.sku)}
          <div class="brow">
            <div class="a-body">
              <div class="bold small">{p.name}</div>
              <div class="muted small">{p.color || p.category}{p.size ? ' • ' + p.size : ''}</div>
            </div>
            <span class="qbadge low">{fmtNum(p.qty)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if dead.length}
    <section class="glass rise" style="animation-delay:0.25s; padding:16px">
      <h2 class="h2" style="margin-bottom:10px"><Icon name="clock" size={17} color="var(--burgundy)" /> مخزون راكد ({dead.length})</h2>
      <p class="muted small" style="margin:0 0 10px">موديلات لم تُبع منذ {settings?.deadStockDays ?? 30} يوم أو أكثر — فكّر بعرض خاص عليها.</p>
      <div class="stack" style="gap:8px">
        {#each dead.slice(0, 8) as p (p.sku)}
          <div class="brow">
            <div class="a-body">
              <div class="bold small">{p.name}</div>
              <div class="muted small">{p.color || p.category}{p.size ? ' • ' + p.size : ''}</div>
            </div>
            <span class="qbadge">{fmtNum(p.qty)}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if totals.returned > 0}
    <section class="glass rise muted-card" style="animation-delay:0.3s; padding:14px 16px">
      <div class="row" style="justify-content:space-between">
        <span class="muted"><Icon name="undo" size={15} /> مبيعات راجع (كل الفترات)</span>
        <span class="money">{totals.returned}</span>
      </div>
    </section>
  {/if}
</div>

<style>
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat { padding: 13px 15px; display: flex; flex-direction: column; gap: 3px; }
  .big { font-size: 20px; font-weight: 800; color: var(--ink); display: flex; align-items: baseline; gap: 4px; }
  .big .cur { font-size: 11px; color: var(--taupe); font-weight: 700; }
  .big.gold { color: var(--gold); }

  .chart { padding: 16px; }
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
</style>
