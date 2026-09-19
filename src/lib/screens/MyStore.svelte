<script>
  /* متجري — ملخص التطبيق كله من أول سجل إلى اليوم.
     لا فلاتر ولا فترات: كل ما في قاعدة البيانات، مجتمعاً في صفحة واحدة. */
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Ticker from '../components/Ticker.svelte';
  import { db, loadProducts, vaultState, moneyInTransit, historicalPayments } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate } from '../utils.js';

  let products = $state([]);
  let sales = $state([]);
  let expenses = $state([]);
  let vault = $state(null);
  let transit = $state(0);
  let archive = $state([]);
  let loaded = $state(false);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, e, v, tr, ar] = await Promise.all([
        loadProducts(), db.sales.toArray(), db.expenses.toArray(),
        vaultState(), moneyInTransit(), historicalPayments()
      ]);
      if (!alive) return;
      products = p;
      sales = s;
      expenses = e;
      vault = v;
      transit = tr;
      archive = ar;
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

  /* ---- المبيعات ---- */
  const saleCount = $derived(liveSales.length);
  const returnedCount = $derived(sales.filter((s) => s.status === 'returned').length);
  const piecesSold = $derived(
    liveSales.reduce((a, s) => a + (s.items || []).reduce((x, it) => x + (Number(it.qty) || 0), 0), 0)
  );
  const avgSale = $derived(saleCount ? Math.round(revenue / saleCount) : 0);
  const lastSale = $derived(
    [...liveSales].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null
  );

  /* ---- المخزون ---- */
  const models = $derived(
    new Set(products.map((p) => p.modelId || `${(p.name || '').trim()}|${p.category || ''}`)).size
  );
  const piecesOnShelf = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0), 0));
  const stockCost = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0));
  const stockPrice = $derived(products.reduce((a, p) => a + (Number(p.qty) || 0) * (Number(p.price) || 0), 0));
  const lastArrival = $derived(
    products
      .map((p) => p.createdAt || p.updatedAt)
      .filter(Boolean)
      .sort()
      .pop() || null
  );

  /* ---- الأطراف ---- */
  const customers = $derived(
    new Set(liveSales.map((s) => String(s.customerPhone || '').replace(/\D/g, '')).filter((x) => x.length >= 10)).size
  );
  const suppliers = $derived(
    new Set(products.map((p) => (p.supplier || '').trim()).filter(Boolean)).size
  );
  const companies = $derived(
    new Set(liveSales.map((s) => (s.deliveryCompany || '').trim()).filter(Boolean)).size
  );

  /* ---- الأعلى ---- */
  const byType = $derived.by(() => {
    const m = new Map();
    for (const s of liveSales) {
      for (const it of s.items || []) {
        const k = it.type || 'غير محدد';
        const cur = m.get(k) || { name: k, profit: 0, qty: 0, revenue: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
        cur.profit += ((Number(it.price) || 0) - (Number(it.cost) || 0)) * (Number(it.qty) || 0);
        m.set(k, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.profit - a.profit);
  });
  const topType = $derived(byType[0] || null);

  const bySupplier = $derived.by(() => {
    const m = new Map();
    for (const p of products) {
      const k = (p.supplier || '').trim() || 'غير محدد';
      const cur = m.get(k) || { name: k, cost: 0, qty: 0, models: new Set() };
      cur.qty += Number(p.qty) || 0;
      cur.cost += (Number(p.qty) || 0) * (Number(p.cost) || 0);
      cur.models.add(p.modelId || p.name);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.cost - a.cost);
  });
  const topSupplier = $derived(bySupplier[0] || null);

  /* ---- المدى الزمني ---- */
  const firstDay = $derived.by(() => {
    const all = [
      ...sales.map((s) => s.date),
      ...products.map((p) => p.createdAt || p.updatedAt),
      ...expenses.map((e) => e.date)
    ].filter(Boolean).sort();
    return all[0] || null;
  });
  const range = $derived(
    firstDay ? `${fmtDate(firstDay).split(' • ')[0]} — اليوم` : 'لا سجلات بعد'
  );

  const vaultBal = $derived(vault?.balance ?? 0);
  const archiveTotal = $derived(archive.reduce((a, p) => a + (Number(p.amount) || 0), 0));
  const empty = $derived(loaded && !sales.length && !products.length && !expenses.length);

  const moneyStats = $derived([
    { label: 'إجمالي الإيرادات', value: revenue, icon: 'wallet' },
    { label: 'صافي الربح', value: profit, icon: 'sparkle', tone: 'gold' },
    { label: 'المصاريف', value: expTotal, icon: 'file' },
    { label: 'الربح بعد المصاريف', value: net, icon: 'check', tone: 'good' }
  ]);
  const saleStats = $derived([
    { label: 'عدد العمليات', value: saleCount, icon: 'cart', num: true },
    { label: 'القطع المباعة', value: piecesSold, icon: 'box', num: true },
    { label: 'المرتجعات', value: returnedCount, icon: 'undo', num: true },
    { label: 'معدل العملية', value: avgSale, icon: 'chart' }
  ]);
  const stockStats = $derived([
    { label: 'الموديلات', value: models, icon: 'tag', num: true },
    { label: 'القطع على الرف', value: piecesOnShelf, icon: 'box', num: true },
    { label: 'قيمة المخزون (تكلفة)', value: stockCost, icon: 'wallet' },
    { label: 'قيمته بالبيع', value: stockPrice, icon: 'sparkle', tone: 'gold' }
  ]);
  const peopleStats = $derived([
    { label: 'الزبونات', value: customers, icon: 'user', num: true },
    { label: 'الموردون', value: suppliers, icon: 'upload', num: true },
    { label: 'شركات التوصيل', value: companies, icon: 'truck', num: true },
    { label: 'عند الشركات الآن', value: transit, icon: 'wallet' }
  ]);
</script>

<div class="stack" style="gap:12px">
  <Glass class="hero rise">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div style="min-width:0">
        <h1 class="h1">متجري</h1>
        <div class="muted small">ملخص كل شيء — من أول سجل إلى اليوم</div>
        <div class="muted tiny" style="margin-top:3px">{range}</div>
      </div>
      <span class="hero-ic"><Icon name="store" size={24} color="var(--burgundy)" /></span>
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
    <section>
      <div class="sec-t">المال — كل الوقت</div>
      <div class="grid">
        {#each moneyStats as st (st.label)}
          <Glass class="stat">
            <span class="s-ic"><Icon name={st.icon} size={16} color="var(--burgundy)" /></span>
            <span class="muted tiny">{st.label}</span>
            <span class="s-v" class:gold={st.tone === 'gold'} class:good={st.tone === 'good'} data-val={st.value}>
              <Ticker value={st.value} />
              <span class="cur">د.ع</span>
            </span>
          </Glass>
        {/each}
      </div>
      <Glass class="vault-row">
        <span class="muted small">الخزنة (الربح المتراكم)</span>
        <span class="s-v gold" data-val={vaultBal}><Ticker value={vaultBal} /> <span class="cur">د.ع</span></span>
      </Glass>
    </section>

    <section>
      <div class="sec-t">المبيعات</div>
      <div class="grid">
        {#each saleStats as st (st.label)}
          <Glass class="stat">
            <span class="s-ic"><Icon name={st.icon} size={16} color="var(--burgundy)" /></span>
            <span class="muted tiny">{st.label}</span>
            <span class="s-v" data-val={st.value}>
              {#if st.num}<Ticker value={st.value} />{:else}<Ticker value={st.value} /> <span class="cur">د.ع</span>{/if}
            </span>
          </Glass>
        {/each}
      </div>
      {#if lastSale}
        <Glass class="last">
          <div class="row" style="justify-content:space-between; align-items:center; gap:8px">
            <div style="min-width:0">
              <div class="muted tiny">آخر عملية بيع</div>
              <div class="bold small">#{lastSale.id} — {lastSale.customerName || 'زبونة'}</div>
              <div class="muted tiny">{fmtDate(lastSale.date)}</div>
            </div>
            <span class="s-v gold" data-val={lastSale.total}><Ticker value={lastSale.total} /> <span class="cur">د.ع</span></span>
          </div>
        </Glass>
      {/if}
    </section>

    <section>
      <div class="sec-t">المخزون</div>
      <div class="grid">
        {#each stockStats as st (st.label)}
          <Glass class="stat">
            <span class="s-ic"><Icon name={st.icon} size={16} color="var(--burgundy)" /></span>
            <span class="muted tiny">{st.label}</span>
            <span class="s-v" class:gold={st.tone === 'gold'} data-val={st.value}>
              {#if st.num}<Ticker value={st.value} />{:else}<Ticker value={st.value} /> <span class="cur">د.ع</span>{/if}
            </span>
          </Glass>
        {/each}
      </div>
      {#if lastArrival}
        <div class="muted tiny" style="padding:2px 4px">آخر استلام بضاعة: {fmtDate(lastArrival)}</div>
      {/if}
    </section>

    <section>
      <div class="sec-t">الأطراف</div>
      <div class="grid">
        {#each peopleStats as st (st.label)}
          <Glass class="stat">
            <span class="s-ic"><Icon name={st.icon} size={16} color="var(--burgundy)" /></span>
            <span class="muted tiny">{st.label}</span>
            <span class="s-v" data-val={st.value}>
              {#if st.num}<Ticker value={st.value} />{:else}<Ticker value={st.value} /> <span class="cur">د.ع</span>{/if}
            </span>
          </Glass>
        {/each}
      </div>
      {#if archiveTotal > 0}
        <Glass class="arch-row">
          <span class="muted small">السجل القديم (دفعات مؤرشفة)</span>
          <span class="s-v" data-val={archiveTotal}><Ticker value={archiveTotal} /> <span class="cur">د.ع</span></span>
        </Glass>
      {/if}
    </section>

    {#if topType || topSupplier}
      <section>
        <div class="sec-t">الأعلى</div>
        <div class="grid two">
          {#if topType}
            <Glass class="stat">
              <span class="s-ic"><Icon name="sparkle" size={16} color="var(--burgundy)" /></span>
              <span class="muted tiny">أعلى نوع ربحاً</span>
              <span class="bold">{topType.name}</span>
              <span class="s-v gold" data-val={topType.profit}><Ticker value={topType.profit} /> <span class="cur">د.ع</span></span>
              <span class="muted tiny">{fmtNum(topType.qty)} قطعة مباعة</span>
            </Glass>
          {/if}
          {#if topSupplier}
            <Glass class="stat">
              <span class="s-ic"><Icon name="upload" size={16} color="var(--burgundy)" /></span>
              <span class="muted tiny">أكبر مورد</span>
              <span class="bold">{topSupplier.name}</span>
              <span class="s-v" data-val={topSupplier.cost}><Ticker value={topSupplier.cost} /> <span class="cur">د.ع</span></span>
              <span class="muted tiny">{fmtNum(topSupplier.models.size)} موديل — {fmtNum(topSupplier.qty)} قطعة</span>
            </Glass>
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  :global(.hero) { padding: 16px; }
  .hero-ic {
    width: 48px; height: 48px; border-radius: 15px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1);
    border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .sec-t {
    margin: 4px 2px 8px;
    font-weight: 900; font-size: 13px; color: var(--ink);
    letter-spacing: 0.2px;
  }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .grid.two { grid-template-columns: 1fr 1fr; }
  :global(.stat) {
    padding: 12px 13px;
    display: flex; flex-direction: column; gap: 2px;
    min-width: 0;
  }
  .s-ic {
    width: 30px; height: 30px; border-radius: 10px; margin-bottom: 3px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft);
  }
  .s-v {
    font-weight: 800; font-size: 14px; color: var(--ink);
    display: flex; align-items: baseline; gap: 3px;
    font-variant-numeric: tabular-nums;
  }
  .s-v.gold { color: #8a6a35; }
  .s-v.good { color: var(--good); }
  .cur { font-size: 10.5px; font-weight: 700; color: var(--taupe); }
  :global(.vault-row), :global(.arch-row), :global(.last) {
    margin-top: 9px; padding: 12px 14px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  :global(.last) { align-items: center; }
  .bold { font-weight: 800; }
</style>
