<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import Logo from '../components/Logo.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, allSettings } from '../db.js';
  import { fmtIQD, fmtNum, isSameDay, daysAgoStart, lastSaleMap } from '../utils.js';
  import { spotlight, tilt } from '../motion.js';

  let { goto } = $props();

  let products = $state([]);
  let sales = $state([]);
  let settings = $state(null);
  let loaded = $state(false);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s] = await Promise.all([db.products.toArray(), db.sales.toArray()]);
      if (!alive) return;
      products = p;
      sales = s;
      loaded = true;
    };
    grab();
    const t = setInterval(grab, 4000);
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

</script>

<div class="stack" style="gap:14px">
  <section class="hero glass rise beam-host" style="animation-delay:0.03s">
    <div class="row" style="gap:12px; align-items:center">
      <Logo size={46} />
      <h1 class="h1">بوتيك غزالة</h1>
    </div>

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
  </section>

  <section class="alerts">
    {#if stock.out > 0 || stock.low > 0}
      <button class="alert glass rise" use:tilt={{ max: 5, scale: 1.01 }} style="animation-delay:0.08s" onclick={() => goto('inventory')}>
        <span class="a-ic warn"><Icon name="alert" size={20} /></span>
        <div class="a-body">
          <div class="bold">{stock.out > 0 ? `${stock.out} موديل نفد من المخزون` : `${stock.low} موديل كمية قليلة`}</div>
          <div class="muted small">اضغط لمراجعة المخزون</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </button>
    {/if}
    {#if dead.length > 0}
      <button class="alert glass rise" use:tilt={{ max: 5, scale: 1.01 }} style="animation-delay:0.12s" onclick={() => goto('reports')}>
        <span class="a-ic dead"><Icon name="clock" size={20} /></span>
        <div class="a-body">
          <div class="bold">{dead.length} موديل بلا حركة منذ {settings?.deadStockDays ?? 30} يوم</div>
          <div class="muted small">شاهد تقرير المخزون الراكد</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </button>
    {/if}
    {#if stock.out === 0 && stock.low === 0 && dead.length === 0 && loaded && products.length > 0}
      <div class="alert glass rise" style="animation-delay:0.08s">
        <span class="a-ic ok"><Icon name="check" size={20} /></span>
        <div class="a-body">
          <div class="bold">كل شيء تحت السيطرة</div>
          <div class="muted small">لا تنبيهات حالياً — ممتاز!</div>
        </div>
      </div>
    {/if}
  </section>

  {#if recent.length}
    <section class="glass rise" style="animation-delay:0.16s; padding:16px">
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
              <div class="muted small">{s.items.length} قطعة</div>
            </div>
            <div class="money">{fmtIQD(s.total)}</div>
          </div>
        {/each}
      </div>
    </section>
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

<style>  .hero { padding: 18px; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
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
  .alert {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 15px; border-radius: var(--r-md);
    text-align: right; width: 100%;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .alert:active { transform: scale(0.98); }
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
  .empty { padding: 30px 22px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-ic {
    width: 72px; height: 72px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: var(--accent-soft);
    border: 1px solid rgba(181, 73, 91, 0.2);
  }
</style>
