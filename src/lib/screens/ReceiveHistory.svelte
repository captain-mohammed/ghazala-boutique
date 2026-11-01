<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, loadProducts, typeChain, modelGroupKey } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, baghdadDayKey, dayLabelFromKey, buzz } from '../utils.js';
  import * as XLSX from 'xlsx';

  let { onback } = $props();

  let lots = $state([]);
  let products = $state([]);
  let loading = $state(true);
  let tab = $state('receipts'); // receipts | suppliers | models
  let q = $state('');
  let openKey = $state(null);

  const TABS = [
    { id: 'receipts', label: 'الوارد' },
    { id: 'suppliers', label: 'الموردون' },
    { id: 'models', label: 'الموديلات' }
  ];

  $effect(() => {
    let alive = true;
    (async () => {
      const [l, p] = await Promise.all([db.lots.toArray(), loadProducts()]);
      if (!alive) return;
      lots = l;
      products = p;
      loading = false;
    })();
    return () => { alive = false; };
  });

  const prodBySku = $derived.by(() => {
    const m = new Map();
    for (const p of products) m.set(p.sku, p);
    return m;
  });
  function modelLabel(sku) {
    const p = prodBySku.get(sku);
    if (!p) return sku;
    return [typeChain(p), p.color, p.size].filter(Boolean).join(' · ') || p.name || sku;
  }

  /* ---------- الوارد: تجميع الدفعات في «استلامات» ---------- */
  const receipts = $derived.by(() => {
    const map = new Map();
    for (const l of lots) {
      if (l.legacy) continue;
      const day = baghdadDayKey(l.receivedAt);
      const sup = (l.supplier || '').trim();
      const inv = (l.invoice || '').trim();
      const key = `${day}|${sup}|${inv}`;
      let r = map.get(key);
      if (!r) {
        r = { key, day, sup, inv, lines: [], pieces: 0, cost: 0, retail: 0, sold: 0, remaining: 0, profit: 0, skus: new Set() };
        map.set(key, r);
      }
      const qty = Number(l.qty) || 0;
      const rem = Number(l.remaining) || 0;
      const sold = Math.max(0, qty - rem);
      r.lines.push(l);
      r.pieces += qty;
      r.cost += qty * (Number(l.cost) || 0);
      r.retail += qty * (Number(l.price) || 0);
      r.sold += sold;
      r.remaining += rem;
      r.profit += sold * ((Number(l.price) || 0) - (Number(l.cost) || 0));
      r.skus.add(l.sku);
    }
    return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  });

  /* ---------- الموردون ---------- */
  const suppliers = $derived.by(() => {
    const map = new Map();
    for (const l of lots) {
      if (l.legacy) continue;
      const sup = (l.supplier || '').trim() || 'بدون مورد';
      let s = map.get(sup);
      if (!s) { s = { sup, invoices: new Set(), pieces: 0, cost: 0, retail: 0, sold: 0, remaining: 0, profit: 0, tied: 0, last: null }; map.set(sup, s); }
      const qty = Number(l.qty) || 0;
      const rem = Number(l.remaining) || 0;
      const sold = Math.max(0, qty - rem);
      s.invoices.add(`${baghdadDayKey(l.receivedAt)}|${(l.invoice || '').trim()}`);
      s.pieces += qty;
      s.cost += qty * (Number(l.cost) || 0);
      s.retail += qty * (Number(l.price) || 0);
      s.sold += sold;
      s.remaining += rem;
      s.profit += sold * ((Number(l.price) || 0) - (Number(l.cost) || 0));
      s.tied += rem * (Number(l.cost) || 0);
      if (!s.last || new Date(l.receivedAt) > new Date(s.last)) s.last = l.receivedAt;
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  });

  /* ---------- الموديلات + اتجاه التكلفة + مقارنة الموردين ---------- */
  const models = $derived.by(() => {
    const map = new Map();
    for (const l of lots) {
      if (l.legacy) continue;
      const p = prodBySku.get(l.sku);
      const mid = l.modelId || (p ? modelGroupKey(p) : l.sku);
      let m = map.get(mid);
      if (!m) { m = { mid, label: modelLabel(l.sku), lots: [], qty: 0, remaining: 0, sold: 0, cost: 0, profit: 0, supMap: new Map() }; map.set(mid, m); }
      const qty = Number(l.qty) || 0;
      const rem = Number(l.remaining) || 0;
      const sold = Math.max(0, qty - rem);
      m.lots.push(l);
      m.qty += qty;
      m.remaining += rem;
      m.sold += sold;
      m.cost += qty * (Number(l.cost) || 0);
      m.profit += sold * ((Number(l.price) || 0) - (Number(l.cost) || 0));
      const sup = (l.supplier || '').trim() || 'بدون مورد';
      const cur = m.supMap.get(sup) || { sup, min: Infinity, max: 0, last: 0, lastAt: null, qty: 0 };
      const c = Number(l.cost) || 0;
      cur.min = Math.min(cur.min, c);
      cur.max = Math.max(cur.max, c);
      cur.qty += qty;
      if (!cur.lastAt || new Date(l.receivedAt) > new Date(cur.lastAt)) { cur.last = c; cur.lastAt = l.receivedAt; }
      m.supMap.set(sup, cur);
    }
    for (const m of map.values()) {
      m.lots.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
      m.firstCost = Number(m.lots[0]?.cost) || 0;
      m.lastCost = Number(m.lots[m.lots.length - 1]?.cost) || 0;
      m.costChange = m.firstCost ? Math.round(((m.lastCost - m.firstCost) / m.firstCost) * 100) : 0;
      m.supList = [...m.supMap.values()]
        .map((x) => ({ ...x, min: x.min === Infinity ? 0 : x.min }))
        .sort((a, b) => a.last - b.last);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  });

  /* ---------- البحث ---------- */
  const qNorm = $derived(q.trim().toLowerCase());
  const receiptsFiltered = $derived(receipts.filter((r) => !qNorm || [r.sup, r.inv, ...r.lines.map((l) => modelLabel(l.sku))].join(' ').toLowerCase().includes(qNorm)));
  const suppliersFiltered = $derived(suppliers.filter((s) => !qNorm || s.sup.toLowerCase().includes(qNorm)));
  const modelsFiltered = $derived(models.filter((m) => !qNorm || [m.label, ...m.supList.map((s) => s.sup)].join(' ').toLowerCase().includes(qNorm)));

  const capitalTied = $derived(lots.reduce((a, l) => a + (!l.legacy ? (Number(l.remaining) || 0) * (Number(l.cost) || 0) : 0), 0));
  const alerts = $derived(models.filter((m) => m.lots.length > 1 && m.costChange >= 10).sort((a, b) => b.costChange - a.costChange));

  const pct = (sold, pieces) => (pieces ? Math.round((sold / pieces) * 100) : 0);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    if (tab === 'receipts') {
      const rows = receiptsFiltered.map((r) => ({
        'التاريخ': r.day, 'المورد': r.sup || '—', 'الفاتورة': r.inv || '—',
        'عدد الموديلات': r.skus.size, 'القطع': r.pieces, 'التكلفة': r.cost, 'قيمة البيع': r.retail,
        'مُباع': r.sold, 'المتبقي': r.remaining, 'الربح': r.profit, 'التصريف %': pct(r.sold, r.pieces)
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'التاريخ': '' }]), 'الوارد');
    } else if (tab === 'suppliers') {
      const rows = suppliersFiltered.map((s) => ({
        'المورد': s.sup, 'الفواتير': s.invoices.size, 'القطع': s.pieces, 'التكلفة': s.cost,
        'قيمة البيع': s.retail, 'مُباع': s.sold, 'المتبقي': s.remaining, 'الربح': s.profit,
        'رأس مال راكد': s.tied, 'التصريف %': pct(s.sold, s.pieces)
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'المورد': '' }]), 'الموردون');
    } else {
      const rows = modelsFiltered.map((m) => ({
        'الموديل': m.label, 'القطع': m.qty, 'مُباع': m.sold, 'المتبقي': m.remaining,
        'أول تكلفة': m.firstCost, 'آخر تكلفة': m.lastCost, 'تغيّر %': m.costChange,
        'الربح': m.profit, 'الموردون': m.supList.map((s) => s.sup).join('، ')
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'الموديل': '' }]), 'الموديلات');
    }
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghazala-receipts-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    buzz(10);
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="justify-content:space-between; align-items:center">
    <button class="btn ghost" style="min-height:36px" onclick={onback}><Icon name="back" size={15} /> التقارير</button>
    <button class="btn ghost" style="min-height:36px" onclick={exportExcel}><Icon name="download" size={15} /> Excel</button>
  </div>

  <div class="row noscroll" style="gap:8px; overflow-x:auto; padding-bottom:2px">
    {#each TABS as t (t.id)}
      <button class="chip" class:on={tab === t.id} onclick={() => { tab = t.id; openKey = null; buzz(5); }}>{t.label}</button>
    {/each}
  </div>

  <Glass style="padding:12px 14px; display:flex; align-items:center; gap:10px">
    <Icon name="wallet" size={18} color="var(--burgundy)" />
    <span class="small muted" style="flex:1">رأس المال الراكد في المخزون (تكلفة المتبقي)</span>
    <b class="money">{fmtIQD(capitalTied)}</b>
  </Glass>

  {#if alerts.length}
    <Glass style="padding:12px 14px; border-color:rgba(181,73,91,0.35); background:rgba(181,73,91,0.06)">
      <div class="row" style="gap:8px; align-items:center"><Icon name="alert" size={16} color="var(--burgundy)" /><span class="bold small">تنبيه ارتفاع تكلفة</span></div>
      {#each alerts.slice(0, 3) as m (m.mid)}
        <div class="muted small" style="margin-top:6px">{m.label} — ارتفعت {fmtNum(m.costChange)}% ({fmtIQD(m.firstCost)} ← {fmtIQD(m.lastCost)})</div>
      {/each}
    </Glass>
  {/if}

  <input class="input" bind:value={q} placeholder="ابحث بالمورد أو رقم الفاتورة أو الموديل…" />

  {#if loading}
    <div class="muted small" style="text-align:center; padding:24px">…جاري التحميل</div>
  {:else if tab === 'receipts'}
    {#if !receiptsFiltered.length}
      <EmptyState title="لا وارد بعد" subtitle="كل فاتورة وارد أو دفعة تسجّلينها تظهر هنا — بالتاريخ والمورد والقطع" icon="upload" />
    {:else}
      <div class="stack" style="gap:8px; padding-bottom:80px">
        {#each receiptsFiltered as r (r.key)}
          <Glass class="rc" style="padding:12px 14px; border-radius:var(--r-md)">
            <button class="rc-head" onclick={() => { openKey = openKey === r.key ? null : r.key; buzz(5); }}>
              <span class="rc-date">{dayLabelFromKey(r.day)}</span>
              <span class="rc-sup">{r.sup || 'بدون مورد'}{r.inv ? ` · #${r.inv}` : ''}</span>
              <span class="rc-pieces">{fmtNum(r.pieces)} قطعة</span>
              <span class="chev" class:flip={openKey === r.key}><Icon name="back" size={13} /></span>
            </button>
            <div class="rc-bar"><i style="width:{pct(r.sold, r.pieces)}%"></i><span>{pct(r.sold, r.pieces)}% مُباع</span></div>
            <div class="rc-stats">
              <span>تكلفة <b>{fmtIQD(r.cost)}</b></span>
              <span>متبقٍّ <b>{fmtNum(r.remaining)}</b></span>
              <span>ربح <b class="good">{fmtIQD(r.profit)}</b></span>
            </div>
            {#if openKey === r.key}
              <div class="lines">
                {#each r.lines as l (l.id)}
                  <div class="line">
                    <span class="ln-name">{modelLabel(l.sku)}</span>
                    <span class="ln-q">{fmtNum(l.qty)} → {fmtNum(l.remaining)}</span>
                    <span class="ln-cost">{fmtIQD(l.cost)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </Glass>
        {/each}
      </div>
    {/if}
  {:else if tab === 'suppliers'}
    {#if !suppliersFiltered.length}
      <EmptyState title="لا موردين بعد" subtitle="الموردون يظهرون تلقائياً من فواتير الوارد والدفعات" icon="upload" />
    {:else}
      <div class="stack" style="gap:8px; padding-bottom:80px">
        {#each suppliersFiltered as s (s.sup)}
          <Glass class="sup" style="padding:13px 15px; border-radius:var(--r-md)">
            <div class="row" style="justify-content:space-between; align-items:center">
              <span class="bold">{s.sup}</span>
              <span class="muted tiny">{fmtNum(s.invoices.size)} فاتورة · آخرها {s.last ? fmtDate(s.last) : '—'}</span>
            </div>
            <div class="rc-bar" style="margin-top:8px"><i style="width:{pct(s.sold, s.pieces)}%"></i><span>{pct(s.sold, s.pieces)}% مُباع</span></div>
            <div class="grid2">
              <span>القطع <b>{fmtNum(s.pieces)}</b></span>
              <span>المتبقي <b>{fmtNum(s.remaining)}</b></span>
              <span>تكلفة الشراء <b>{fmtIQD(s.cost)}</b></span>
              <span>الربح <b class="good">{fmtIQD(s.profit)}</b></span>
              <span>رأس مال راكد <b class="warn">{fmtIQD(s.tied)}</b></span>
            </div>
          </Glass>
        {/each}
      </div>
    {/if}
  {:else}
    {#if !modelsFiltered.length}
      <EmptyState title="لا موديلات بعد" subtitle="سجّلي وارداً — يظهر هنا تاريخ كل موديل وتكلفته عبر الزمن" icon="box" />
    {:else}
      <div class="stack" style="gap:8px; padding-bottom:80px">
        {#each modelsFiltered as m (m.mid)}
          <Glass class="mdl" style="padding:13px 15px; border-radius:var(--r-md)">
            <div class="row" style="justify-content:space-between; align-items:center">
              <span class="bold small">{m.label}</span>
              <span class="muted tiny">{fmtNum(m.qty)} قطعة · متبقٍّ {fmtNum(m.remaining)}</span>
            </div>
            <div class="rc-bar" style="margin-top:8px"><i style="width:{pct(m.sold, m.qty)}%"></i><span>{pct(m.sold, m.qty)}% مُباع</span></div>
            <div class="row wrap" style="gap:8px; margin-top:8px">
              <span class="tag">تكلفة أولى {fmtIQD(m.firstCost)}</span>
              <span class="tag">آخر تكلفة {fmtIQD(m.lastCost)}</span>
              {#if m.costChange !== 0}
                <span class="tag" class:up={m.costChange > 0} class:down={m.costChange < 0}>{m.costChange > 0 ? '▲' : '▼'} {fmtNum(Math.abs(m.costChange))}%</span>
              {/if}
              <span class="tag good-tag">ربح {fmtIQD(m.profit)}</span>
            </div>
            {#if m.supList.length > 1}
              <div class="cmp">
                <div class="cmp-title">مقارنة الموردين لنفس الموديل</div>
                {#each m.supList as sp (sp.sup)}
                  <div class="cmp-row" class:best={sp === m.supList[0]}>
                    <span>{sp.sup}</span>
                    <span class="muted tiny">{fmtNum(sp.qty)} قطعة</span>
                    <span class="cmp-cost">{fmtIQD(sp.last)}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </Glass>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .rc-head { width: 100%; display: flex; align-items: center; gap: 8px; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; text-align: start; }
  .rc-date { flex: none; font-size: 12px; font-weight: 900; color: var(--burgundy); background: rgba(181,73,91,0.1); border-radius: 999px; padding: 3px 9px; }
  .rc-sup { flex: 1; min-width: 0; font-weight: 800; font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rc-pieces { flex: none; font-size: 12px; font-weight: 800; color: var(--taupe); }
  .rc-bar { position: relative; height: 16px; border-radius: 999px; background: rgba(156,123,107,0.16); margin-top: 9px; overflow: hidden; }
  .rc-bar i { position: absolute; inset-inline-start: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--gold), var(--burgundy)); border-radius: 999px; }
  .rc-bar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800; color: #3A1A20; }
  .rc-stats { display: flex; gap: 14px; margin-top: 8px; font-size: 11.5px; color: var(--taupe); flex-wrap: wrap; }
  .rc-stats b { color: var(--ink); }
  .good { color: var(--good) !important; }
  .warn { color: var(--warn) !important; }
  .lines { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; display: flex; flex-direction: column; gap: 5px; }
  .line { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
  .ln-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .ln-q { flex: none; color: var(--taupe); font-variant-numeric: tabular-nums; }
  .ln-cost { flex: none; font-weight: 800; color: var(--burgundy); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px; margin-top: 8px; font-size: 11.5px; color: var(--taupe); }
  .grid2 b { color: var(--ink); }
  .tag { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 999px; background: rgba(156,123,107,0.13); color: var(--taupe); }
  .tag.up { background: rgba(181,73,91,0.12); color: var(--burgundy); }
  .tag.down { background: rgba(78,138,95,0.14); color: var(--good); }
  .tag.good-tag { background: rgba(78,138,95,0.14); color: var(--good); }
  .cmp { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
  .cmp-title { font-size: 10.5px; font-weight: 800; color: var(--taupe); margin-bottom: 5px; }
  .cmp-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding: 4px 6px; border-radius: 8px; }
  .cmp-row.best { background: rgba(78,138,95,0.1); }
  .cmp-row span:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmp-cost { font-weight: 800; color: var(--burgundy); }
  .btn { font-family: inherit; font-size: 12.5px; font-weight: 700; border-radius: var(--r-md); padding: 0 12px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); display: inline-flex; align-items: center; gap: 5px; }
  .btn.ghost { background: transparent; }
  .chev { flex: none; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.2s; color: var(--taupe); }
  .chev.flip { transform: rotate(-90deg); }
</style>
