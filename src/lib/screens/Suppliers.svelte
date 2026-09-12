<script>
  /* دفتر الموردين — منين اشتريتِ وكم بيع
     كل مورد: عدد الموديلات، القطع المشتراة، التكلفة الإجمالية،
     القطع المتبقية على الرف، ما بيع، وإيراد مبيعاته وربحه. */
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, getSetting } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz } from '../utils.js';

  let { goto } = $props();

  let rows = $state([]);
  let open = $state(null);   // supplier being expanded
  let loading = $state(true);

  onMount(load);
  async function load() {
    loading = true;
    const [products, sales, suppliers] = await Promise.all([
      db.products.toArray(),
      db.sales.toArray(),
      getSetting('suppliers', [])
    ]);
    const saleBySku = new Map();
    for (const s of sales) {
      if (s.status === 'returned') continue;
      for (const it of s.items || []) {
        const cur = saleBySku.get(it.sku) || { qty: 0, revenue: 0, cost: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.revenue += (Number(it.price) || 0) * (Number(it.qty) || 0);
        cur.cost += (Number(it.cost) || 0) * (Number(it.qty) || 0);
        saleBySku.set(it.sku, cur);
      }
    }
    /* group products by supplier — legacy cards without a supplier land in «غير محدد» */
    const map = new Map();
    for (const p of products) {
      const sup = (p.supplier || '').trim() || 'غير محدد';
      if (!map.has(sup)) map.set(sup, { name: sup, models: new Map(), boughtQty: 0, boughtCost: 0, skus: [] });
      const g = map.get(sup);
      if (!g.models.has(p.modelId || p.name)) {
        g.models.set(p.modelId || p.name, { name: p.name, photo: p.photo, price: p.price, type: p.type, typeSub: p.typeSub, typeSub2: p.typeSub2, typeSub3: p.typeSub3, createdAt: p.createdAt, sku: p.sku });
        g.skus.push(p.sku);
      }
      g.boughtQty += (p.qty || 0) + (saleBySku.get(p.sku)?.qty || 0);   /* المشتري = المتبقي + المبيع */
      g.boughtCost += (p.cost || 0) * ((p.qty || 0) + (saleBySku.get(p.sku)?.qty || 0));
    }
    rows = [...map.values()].map((g) => {
      let soldQty = 0, revenue = 0, cost = 0, soldModels = new Set();
      for (const sku of g.skus) {
        const s = saleBySku.get(sku);
        if (!s) continue;
        soldQty += s.qty; revenue += s.revenue; cost += s.cost;
        soldModels.add(sku);
      }
      const leftQty = [...new Set(g.skus)].reduce((a, sku) => {
        const p = products.find((x) => x.sku === sku);
        return a + (p?.qty || 0);
      }, 0);

      const profit = revenue - cost;
      const sellPct = g.boughtQty ? Math.round((soldQty / g.boughtQty) * 100) : 0;
      return {
        ...g,
        modelCount: g.models.size,
        soldQty, revenue, profit, leftQty, sellPct,
        lastIn: g.skus.map((sku) => products.find((x) => x.sku === sku)?.supplierAt).filter(Boolean).sort().pop() || null
      };
    }).sort((a, b) => b.boughtCost - a.boughtCost);
    loading = false;
  }

  function openModel(sku) {
    /* open the inventory model sheet via the stock route */
    buzz(6);
    goto('inventory');
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="hero rise" style="padding:16px">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div>
        <h1 class="h1">دخيل الموردين</h1>
        <div class="muted small">منين تشترين — ووش صار من مبيعات كل مورد</div>
      </div>
      <span class="hero-ic"><Icon name="upload" size={22} color="var(--burgundy)" /></span>
    </div>
  </Glass>

  {#if loading}
    <div class="muted small" style="text-align:center; padding:30px">…جاري الحساب</div>
  {:else if !rows.length}
    <EmptyState
      title="لا موردون بعد"
      body="سجلي مورديك من الإعدادات، وحددي المورد عند استلام الفاتورة — وكل شيء يُحسب هنا تلقائياً"
      icon="upload"
    />
  {:else}
    {#each rows as r, i (r.name)}
      <Glass class="rise" style="animation-delay:{Math.min(i * 0.05, 0.3)}s; padding:14px">
        <button class="sup-head" onclick={() => { buzz(6); open = open === r.name ? null : r.name; }}>
          <div class="row" style="justify-content:space-between; align-items:center; width:100%">
            <div style="min-width:0">
              <div class="sup-name">{r.name}</div>
              <div class="muted tiny">{fmtNum(r.modelCount)} موديل{r.lastIn ? ` — آخر استلام ${fmtDate(r.lastIn)}` : ''}</div>
            </div>
            <div class="col" style="align-items:flex-end; gap:2px">
              <span class="money">{fmtIQD(r.boughtCost)}</span>
              <span class="muted tiny">{fmtNum(r.boughtQty)} قطعة مشتراة</span>
            </div>
          </div>
          <span class="chev" class:flip={open === r.name}><Icon name="back" size={14} /></span>
        </button>

        {#if open === r.name}
          <div class="sup-detail">
            <div class="kv">
              <span class="muted small">بيع منها</span>
              <span class="bold small">{fmtNum(r.soldQty)} قطعة</span>
            </div>
            <div class="kv">
              <span class="muted small">إيراد مبيعاته</span>
              <span class="money small">{fmtIQD(r.revenue)}</span>
            </div>
            <div class="kv">
              <span class="muted small">ربحها الصافي</span>
              <span class="bold small" style="color:{r.profit >= 0 ? 'var(--good)' : 'var(--burgundy)'}">{fmtIQD(r.profit)}</span>
            </div>
            <div class="kv">
              <span class="muted small">متبقي على الرف</span>
              <span class="bold small">{fmtNum(r.leftQty)} قطعة</span>
            </div>
            <div class="sell-bar">
              <i style="width:{Math.min(100, r.sellPct)}%"></i>
            </div>
            <div class="muted tiny" style="text-align:center">نسبة التصريف: {r.sellPct}% من المشتراة</div>

            {#if r.models.size}
              <div class="m-title muted tiny">موديلاته</div>
              <div class="m-list">
                {#each [...r.models.values()] as m (m.sku)}
                  <div class="m-row">
                    <span class="m-thumb">{#if m.photo}<img src={m.photo} alt="" />{:else}<Icon name="image" size={14} color="var(--taupe)" />{/if}</span>
                    <div style="flex:1; min-width:0">
                      {#if m.type || m.typeSub}<div class="bold tiny">{[m.type, m.typeSub, m.typeSub2, m.typeSub3].filter(Boolean).join(' - ')}</div>{/if}
                      <div class="muted tiny">{fmtIQD(m.price)}</div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </Glass>
    {/each}
  {/if}
</div>

<style>
  .hero-ic {
    width: 44px; height: 44px; border-radius: 14px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1);
    border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .sup-head {
    width: 100%; display: flex; align-items: center; gap: 8px;
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: inherit; text-align: right;
  }
  .sup-name { font-weight: 800; font-size: 15px; color: var(--ink); }
  .chev { color: var(--taupe); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); transform: rotate(90deg); }
  .chev.flip { transform: rotate(-90deg); }
  .sup-detail { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line-2); display: flex; flex-direction: column; gap: 8px; }
  .kv { display: flex; justify-content: space-between; align-items: center; }
  .sell-bar {
    height: 7px; border-radius: 999px; overflow: hidden;
    background: rgba(122, 46, 58, 0.1); margin-top: 4px;
  }
  .sell-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--gold), var(--burgundy)); transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1); }
  .m-title { margin-top: 6px; font-weight: 800; }
  .m-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
  .m-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.4); }
  .m-thumb {
    width: 34px; height: 34px; border-radius: 9px; flex: none; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.5); border: 1px solid var(--line);
  }
  .m-thumb img { width: 100%; height: 100%; object-fit: cover; }
</style>
