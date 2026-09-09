<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import Logo from '../components/Logo.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, allSettings, upcomingOccasions } from '../db.js';
  import { fmtIQD, fmtNum, isSameDay, daysAgoStart, lastSaleMap, salePieces, fmtDate } from '../utils.js';
  import { spotlight, tilt } from '../motion.js';

  /* tilt for Glass-hosted alert buttons (Glass applies it via its action prop) */
  const tiltAlert = (node) => tilt(node, { max: 5, scale: 1.01 });

  let { goto } = $props();

  let products = $state([]);
  let sales = $state([]);
  let settings = $state(null);
  let loaded = $state(false);
  let occasions = $state([]);
  let reservations = $state([]);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, r] = await Promise.all([db.products.toArray(), db.sales.toArray(), db.reservations.toArray()]);
      if (!alive) return;
      products = p;
      sales = s;
      reservations = r.filter((x) => x.status === 'active');
      loaded = true;
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  $effect(() => {
    let alive = true;
    upcomingOccasions(7).then((o) => { if (alive) occasions = o; });
    const t = setInterval(() => upcomingOccasions(7).then((o) => { if (alive) occasions = o; }), 60000);
    return () => { alive = false; clearInterval(t); };
  });

  onMount(async () => { settings = await allSettings(); });

  const todaySales = $derived(sales.filter((s) => s.status !== 'returned' && isSameDay(s.date)));
  const today = $derived({
    count: todaySales.length,
    total: todaySales.reduce((a, s) => a + s.total, 0),
    profit: todaySales.reduce((a, s) => a + s.profit, 0)
  });

  const stock = $derived({
    models: products.length,
    units: products.reduce((a, p) => a + (p.qty || 0), 0),
    value: products.reduce((a, p) => a + (p.qty || 0) * (p.cost || 0), 0),
    low: products.filter((p) => p.qty > 0 && p.qty <= (settings?.lowStockThreshold ?? 3)).length,
    out: products.filter((p) => !p.qty).length
  });

  const dead = $derived.by(() => {
    if (!settings) return [];
    const lm = lastSaleMap(sales.filter((s) => s.status !== 'returned'));
    const cutoff = daysAgoStart(settings.deadStockDays ?? 30);
    return products.filter((p) => p.qty > 0 && (!lm.get(p.sku) || new Date(lm.get(p.sku)) < cutoff));
  });

  const recent = $derived([...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4));

  /* Money currently held by delivery companies (not yet settled) */
  const transit = $derived(
    sales
      .filter((s) => s.status !== 'returned' && !s.settledAt)
      .reduce((a, s) => a + (Number(s.total) || 0), 0)
  );
  const transitCount = $derived(sales.filter((s) => s.status !== 'returned' && !s.settledAt).length);

  /* ---- Daily briefing: one friendly morning line, parts assembled by importance ---- */
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير 🌸';
    if (h < 17) return 'مساء الخير 🌷';
    return 'مساء الخير 🌙';
  });
  const expiringRes = $derived(
    reservations.filter((r) => (new Date(r.expiresAt) - Date.now()) / 3600000 <= 12)
  );
  const briefing = $derived.by(() => {
    const parts = [];
    const y = daysAgoStart(1);
    const yNext = new Date(y.getTime() + 86400000);
    const yPieces = sales
      .filter((s) => s.status !== 'returned' && new Date(s.date) >= y && new Date(s.date) < yNext)
      .reduce((a, s) => a + salePieces(s), 0);
    if (yPieces > 0) parts.push(`البارحة بيعنا ${fmtNum(yPieces)} قطعة`);
    if (transit > 0) parts.push(`عند التوصيل ${fmtIQD(transit)}`);
    if (expiringRes.length > 0) parts.push(`${fmtNum(expiringRes.length)} حجز راح يخلص قريباً`);
    const occ = occasions[0];
    if (occ) parts.push(occ.inDays === 0 ? `مناسبة ${occ.customerName} اليوم 🎉` : `مناسبة ${occ.customerName} بعد ${fmtNum(occ.inDays)} يوم`);
    return parts;
  });

  /* One-shot border beam: runs only when a headline number actually changes,
     then removes itself — nothing loops on its own. */
  let beamOn = $state(false);
  let beamTimer;
  const headline = $derived(`${today.total}|${today.profit}|${stock.value}|${stock.units}`);
  let prevHeadline = headline;
  $effect(() => {
    if (headline === prevHeadline) { prevHeadline = headline; return; }
    prevHeadline = headline;
    beamOn = true;
    clearTimeout(beamTimer);
    beamTimer = setTimeout(() => (beamOn = false), 2500);
    return () => clearTimeout(beamTimer);
  });

</script>

<div class="stack" style="gap:14px">
  <!-- Brand block: standalone on the aurora -->
  <header class="brand rise" style="animation-delay:0.03s">
    <Logo size={56} />
    <h1 class="h1">بوتيك غزالة</h1>
  </header>

  {#if loaded && briefing.length}
    <Glass class="brief rise" style="animation-delay:0.045s" onclick={() => { buzz(6); goto('reports'); }} role="button" tabindex="0">
      <span class="b-ic"><Icon name="sparkle" size={16} color="#fff" /></span>
      <div class="a-body">
        <div class="bold small">{greeting}</div>
        <div class="muted small">{briefing.join(' • ')}</div>
      </div>
    </Glass>
  {/if}

  {#if transit > 0}
    <Glass
      as="button"
      class="transit rise"
      style="animation-delay:0.06s; border-radius:var(--r-md)"
      onclick={() => { buzz(6); goto('ledger'); }}
    >
      <span class="tr-ic"><Icon name="truck" size={18} color="#fff" /></span>
      <div class="a-body">
        <div class="bold">عند شركات التوصيل: {fmtIQD(transit)}</div>
        <div class="muted small">{fmtNum(transitCount)} عملية — اضغط للحساب والتسوية</div>
      </div>
      <Icon name="back" size={16} color="var(--taupe)" />
    </Glass>
  {/if}

  <Glass class="hero rise beam-host {beamOn ? 'beam-run' : ''}" style="animation-delay:0.03s; padding:18px">
    <div class="grid2">
      <div class="stat spot" use:spotlight>
        <div class="muted small">مبيعات اليوم</div>
        <div class="big"><Ticker value={today.total} /> <span class="cur">د.ع</span></div>
        <div class="muted small">{today.count} عملية بيع</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">ربح اليوم</div>
        <div class="big gold"><Ticker value={today.profit} /> <span class="cur">د.ع</span></div>
        <div class="muted small">صافي الربح</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">قيمة المخزون</div>
        <div class="big"><Ticker value={stock.value} /> <span class="cur">د.ع</span></div>
        <div class="muted small">بسعر التكلفة</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">قطع المخزون</div>
        <div class="big"><Ticker value={stock.units} /></div>
        <div class="muted small">{stock.models} موديل</div>
      </div>
    </div>
  </Glass>

  <section class="alerts">
    {#if stock.out > 0 || stock.low > 0}
      <Glass
        as="button"
        class="alert rise"
        style="animation-delay:0.08s; border-radius:var(--r-md)"
        action={tiltAlert}
        onclick={() => goto('inventory')}
      >
        <span class="a-ic warn"><Icon name="alert" size={20} /></span>
        <div class="a-body">
          <div class="bold">{stock.out > 0 ? `${stock.out} موديل نفد من المخزون` : `${stock.low} موديل كمية قليلة`}</div>
          <div class="muted small">اضغط لمراجعة المخزون</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </Glass>
    {/if}
    {#if dead.length > 0}
      <Glass
        as="button"
        class="alert rise"
        style="animation-delay:0.12s; border-radius:var(--r-md)"
        action={tiltAlert}
        onclick={() => goto('reports')}
      >
        <span class="a-ic dead"><Icon name="clock" size={20} /></span>
        <div class="a-body">
          <div class="bold">{dead.length} موديل بلا حركة منذ {settings?.deadStockDays ?? 30} يوم</div>
          <div class="muted small">شاهد تقرير المخزون الراكد</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </Glass>
    {/if}
    {#if stock.out === 0 && stock.low === 0 && dead.length === 0 && loaded && products.length > 0}
      <Glass class="alert rise" style="animation-delay:0.08s; border-radius:var(--r-md)">
        <span class="a-ic ok"><Icon name="check" size={20} /></span>
        <div class="a-body">
          <div class="bold">كل شيء تحت السيطرة</div>
          <div class="muted small">لا تنبيهات حالياً — ممتاز!</div>
        </div>
      </Glass>
    {/if}
  </section>

  {#if recent.length}
    <Glass class="rise" style="animation-delay:0.16s; padding:16px">
      <div class="row" style="justify-content:space-between; margin-bottom:10px">
        <h2 class="h2">آخر العمليات</h2>
        <button class="btn ghost" style="min-height:36px; padding:0 12px" onclick={() => goto('saleslog')}>السجل الكامل</button>
      </div>
      <div class="stack" style="gap:8px">
        {#each recent as s, i (s.id)}
          <div class="sale-row pop" style="animation-delay:{0.2 + i * 0.06}s">
            <span class="s-ic"><Icon name={s.status === 'returned' ? 'undo' : 'cart'} size={18} color="var(--burgundy)" /></span>
            <div class="a-body">
              <div class="bold">{s.customerName || 'زبون'}</div>
              <div class="muted small">{fmtNum(salePieces(s))} قطعة</div>
            </div>
            <div class="money">{fmtIQD(s.total)}</div>
          </div>
        {/each}
      </div>
    </Glass>
  {:else if loaded && products.length === 0}
    <div style="animation-delay:0.16s">
      <EmptyState
        title="ابدأ بجرد بوتيكك"
        subtitle="أضف أول حذاء من تبويب المخزون — كل شيء يبقى محفوظاً في جهازك"
        actionLabel="إضافة أول موديل"
        onaction={() => goto('inventory')}
      />
    </div>
  {/if}
</div>

<style>  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 4px 6px 0;
  }
  .brand :global(.h1) { margin: 0; }

  :global(.transit) {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border-radius: var(--r-md);
    text-align: right; width: 100%; cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.brief) {
    display: flex; align-items: center; gap: 11px;
    padding: 11px 14px; border-radius: var(--r-md);
    cursor: pointer;
  }
  .b-ic {
    flex: none; width: 34px; height: 34px;
    border-radius: 11px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
  }
  :global(.transit:active) { transform: scale(0.98); }
  .tr-ic {
    flex: none; width: 40px; height: 40px;
    border-radius: 13px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(164, 128, 62, 0.3);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat {
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .big { font-size: 21px; font-weight: 800; color: var(--ink); display: flex; align-items: baseline; gap: 4px; }
  .big .cur { font-size: 11px; color: var(--taupe); font-weight: 700; }
  .big.gold { color: var(--gold); }

  .alerts { display: flex; flex-direction: column; gap: 10px; }
  :global(.alert) {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 15px; border-radius: var(--r-md);
    text-align: right; width: 100%;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.alert:active) { transform: scale(0.98); }
  .a-ic {
    flex: none;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
  }
  .a-ic.warn { background: rgba(192, 127, 58, 0.14); color: var(--warn); }
  .a-ic.dead { background: var(--accent-soft); color: var(--burgundy); }
  .a-ic.ok { background: rgba(78, 138, 95, 0.12); color: var(--good); }
  .a-body { flex: 1; display: flex; flex-direction: column; gap: 1px; }

  .sale-row {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 10px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
  .s-ic {
    flex: none; width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px;
    background: var(--accent-soft);
  }
</style>
