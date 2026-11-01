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
  let receiptsById = $state(new Map());
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
      const [l, p, recs] = await Promise.all([db.lots.toArray(), loadProducts(), db.receipts.toArray()]);
      if (!alive) return;
      lots = l;
      products = p;
      receiptsById = new Map(recs.map((x) => [x.id, x]));
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
  /* التاريخ بلا سنة إن كان في السنة الحالية، ومع السنة إن كان قديماً */
  function dateLabel(key) {
    const y = String(key).slice(0, 4);
    const nowY = baghdadDayKey(new Date()).slice(0, 4);
    return dayLabelFromKey(key) + (y !== nowY ? ` ${y}` : '');
  }

  /* ---------- الوارد: تجميع الدفعات في «استلامات» ---------- */
  const receipts = $derived.by(() => {
    const map = new Map();
    for (const l of lots) {
      if (l.legacy) continue;
      /* هوية الاستلام تُقرأ من receiptId (مُنحت عند الحفظ). الدفعات القديمة
         بلا رقم استلام ترتد إلى تجميع (تاريخ+مورد+فاتورة) كما كانت. */
      const rec = l.receiptId ? receiptsById.get(l.receiptId) : null;
      const day = baghdadDayKey(rec?.date || l.receivedAt);
      const sup = (rec?.supplier || l.supplier || '').trim();
      const inv = (rec?.invoice || l.invoice || '').trim();
      const key = rec ? `r:${l.receiptId}` : `f:${day}|${sup}|${inv}`;
      let r = map.get(key);
      if (!r) {
        r = { key, rec, no: rec?.no || '', day, sup, inv, note: rec?.note || '', lines: [], pieces: 0, cost: 0, retail: 0, sold: 0, remaining: 0, profit: 0, skus: new Set() };
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
  const receiptsFiltered = $derived(receipts.filter((r) => !qNorm || [r.no, r.sup, r.inv, r.note, ...r.lines.map((l) => modelLabel(l.sku))].join(' ').toLowerCase().includes(qNorm)));
  const suppliersFiltered = $derived(suppliers.filter((s) => !qNorm || s.sup.toLowerCase().includes(qNorm)));
  const modelsFiltered = $derived(models.filter((m) => !qNorm || [m.label, ...m.supList.map((s) => s.sup)].join(' ').toLowerCase().includes(qNorm)));

  const capitalTied = $derived(lots.reduce((a, l) => a + (!l.legacy ? (Number(l.remaining) || 0) * (Number(l.cost) || 0) : 0), 0));
  const alerts = $derived(models.filter((m) => m.lots.length > 1 && m.costChange >= 10).sort((a, b) => b.costChange - a.costChange));

  const pct = (sold, pieces) => (pieces ? Math.round((sold / pieces) * 100) : 0);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    if (tab === 'receipts') {
      const rows = receiptsFiltered.map((r) => ({
        'رقم الاستلام': r.no || '—', 'التاريخ': r.day, 'المورد': r.sup || '—', 'الفاتورة': r.inv || '—',
        'عدد الموديلات': r.skus.size, 'القطع': r.pieces, 'التكلفة': r.cost, 'قيمة البيع': r.retail,
        'مُباع': r.sold, 'المتبقي': r.remaining, 'الربح': r.profit, 'التصريف %': pct(r.sold, r.pieces), 'ملاحظة': r.note || ''
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
  <div class="hist-top">
    <button class="btn ghost" style="min-height:36px" onclick={onback}><Icon name="back" size={15} /> رجوع</button>
    <span class="hist-title">سجل الوارد</span>
    <button class="btn ghost" style="min-height:36px" onclick={exportExcel}><Icon name="download" size={15} /> Excel</button>
  </div>

  <div class="tabs">
    {#each TABS as t (t.id)}
      <button class="tab" class:on={tab === t.id} onclick={() => { tab = t.id; openKey = null; buzz(5); }}>{t.label}</button>
    {/each}
  </div>

  <Glass class="cap-card">
    <span class="cap-ic"><Icon name="wallet" size={19} color="var(--burgundy)" /></span>
    <span class="cap-body">
      <span class="cap-k">رأس المال الراكد في المخزون</span>
      <span class="cap-v">{fmtIQD(capitalTied)}</span>
    </span>
    <span class="cap-hint">تكلفة المتبقي</span>
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
          <Glass class="rc">
            <button class="rc-head" onclick={() => { openKey = openKey === r.key ? null : r.key; buzz(5); }}>
              <span class="rc-date">{dateLabel(r.day)}</span>
              <span class="rc-title">
                <span class="rc-sup">{r.sup || 'بدون مورد'}</span>
                <span class="rc-sub">{r.inv ? `فاتورة المورد #${r.inv}` : (r.no || 'بلا رقم')}</span>
              </span>
              <span class="rc-pieces">{fmtNum(r.pieces)} قطعة</span>
              <span class="chev" class:flip={openKey === r.key}><Icon name="back" size={13} /></span>
            </button>

            <div class="rc-sell">
              <div class="rc-bar"><i style="width:{pct(r.sold, r.pieces)}%"></i></div>
              <span class="rc-pct">{pct(r.sold, r.pieces)}% مُباع</span>
            </div>

            <div class="rc-stats">
              <div class="stat"><span class="k">التكلفة</span><b>{fmtIQD(r.cost)}</b></div>
              <div class="stat"><span class="k">المتبقي</span><b>{fmtNum(r.remaining)}</b></div>
              <div class="stat"><span class="k">الربح</span><b class:good={r.profit > 0} class:bad={r.profit < 0}>{fmtIQD(r.profit)}</b></div>
            </div>

            {#if (r.inv && r.no) || r.note}
              <div class="rc-foot">
                {#if r.inv && r.no}<span class="rc-auto">{r.no}</span>{/if}
                {#if r.note}<span class="rc-note"><Icon name="file" size={11} /> <span>{r.note}</span></span>{/if}
              </div>
            {/if}

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
          <Glass class="sup">
            <div class="sup-head">
              <span class="sup-avatar">{(s.sup || '?').trim().charAt(0)}</span>
              <div class="sup-id">
                <span class="sup-name">{s.sup}</span>
                <span class="sup-meta">{fmtNum(s.invoices.size)} فاتورة{s.last ? ` · آخرها ${fmtDate(s.last)}` : ''}</span>
              </div>
            </div>
            <div class="rc-sell"><div class="rc-bar"><i style="width:{pct(s.sold, s.pieces)}%"></i></div><span class="rc-pct">{pct(s.sold, s.pieces)}% مُباع</span></div>
            <div class="sup-stats">
              <div class="stat"><span class="k">القطع</span><b>{fmtNum(s.pieces)}</b></div>
              <div class="stat"><span class="k">المتبقي</span><b>{fmtNum(s.remaining)}</b></div>
              <div class="stat"><span class="k">تكلفة الشراء</span><b>{fmtIQD(s.cost)}</b></div>
              <div class="stat"><span class="k">الربح</span><b class:good={s.profit > 0} class:bad={s.profit < 0}>{fmtIQD(s.profit)}</b></div>
            </div>
            <div class="sup-foot"><span class="muted tiny">رأس مال راكد</span><b class="warn">{fmtIQD(s.tied)}</b></div>
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
          <Glass class="mdl">
            <div class="mdl-head">
              <span class="mdl-ic"><Icon name="box" size={16} color="var(--burgundy)" /></span>
              <div class="mdl-id">
                <span class="mdl-name">{m.label}</span>
                <span class="mdl-meta">{fmtNum(m.qty)} قطعة · متبقٍّ {fmtNum(m.remaining)}</span>
              </div>
              <span class="mdl-profit"><span class="k">الربح</span><b class:good={m.profit > 0} class:bad={m.profit < 0}>{fmtIQD(m.profit)}</b></span>
            </div>
            <div class="rc-sell"><div class="rc-bar"><i style="width:{pct(m.sold, m.qty)}%"></i></div><span class="rc-pct">{pct(m.sold, m.qty)}% مُباع</span></div>
            <div class="mdl-cost">
              <span class="k">التكلفة</span>
              <span class="cost-from">{fmtIQD(m.firstCost)}</span>
              <span class="arrow">←</span>
              <span class="cost-to">{fmtIQD(m.lastCost)}</span>
              {#if m.costChange !== 0}
                <span class="delta" class:up={m.costChange > 0} class:down={m.costChange < 0}>{m.costChange > 0 ? '▲' : '▼'} {fmtNum(Math.abs(m.costChange))}%</span>
              {/if}
            </div>
            {#if m.supList.length > 1}
              <div class="cmp">
                <div class="cmp-title">مقارنة الموردين لنفس الموديل</div>
                {#each m.supList as sp, i (sp.sup)}
                  <div class="cmp-row" class:best={i === 0}>
                    <span class="cmp-sup">{sp.sup}</span>
                    <span class="cmp-qty">{fmtNum(sp.qty)} قطعة</span>
                    <span class="cmp-cost">{fmtIQD(sp.last)}</span>
                    {#if i === 0}<span class="cmp-best">الأرخص</span>{/if}
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
  /* ---------- شريط أعلى + تبويبات ---------- */
  .hist-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .hist-title { font-weight: 900; font-size: 15px; color: var(--ink); letter-spacing: 0.2px; }
  .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding: 4px; border-radius: 999px; background: rgba(156, 123, 107, 0.1); border: 1px solid var(--line); }
  .tab { border: none; background: none; font-family: inherit; font-size: 13px; font-weight: 800; color: var(--taupe); padding: 9px 0; border-radius: 999px; cursor: pointer; transition: background 0.18s, color 0.18s, box-shadow 0.18s; }
  .tab.on { background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep)); color: #fff; box-shadow: 0 4px 12px rgba(122, 46, 58, 0.28); }

  /* ---------- بطاقة رأس المال ---------- */
  :global(.cap-card) { padding: 12px 14px; display: flex; align-items: center; gap: 12px; border-radius: var(--r-md); }
  .cap-ic { flex: none; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(181, 73, 91, 0.1); border: 1px solid rgba(181, 73, 91, 0.16); }
  .cap-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cap-k { font-size: 11px; font-weight: 700; color: var(--taupe); }
  .cap-v { font-size: 17px; font-weight: 900; color: var(--burgundy); font-variant-numeric: tabular-nums; }
  .cap-hint { flex: none; font-size: 9.5px; font-weight: 700; color: var(--taupe); background: rgba(156, 123, 107, 0.1); border-radius: 999px; padding: 3px 8px; }

  /* ---------- بطاقة الاستلام ---------- */
  :global(.rc) {
    position: relative; padding: 13px 14px; border-radius: var(--r-md);
    border: 1px solid var(--line-2);
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.72), rgba(251, 243, 238, 0.55));
    overflow: hidden;
  }
  :global(.rc)::before {
    content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px;
    background: linear-gradient(180deg, var(--gold), var(--burgundy)); opacity: 0.75;
  }
  .rc-head { width: 100%; display: flex; align-items: center; gap: 10px; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; text-align: start; }
  .rc-date { flex: none; font-size: 11px; font-weight: 900; color: var(--burgundy); background: rgba(181, 73, 91, 0.09); border: 1px solid rgba(181, 73, 91, 0.16); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  .rc-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .rc-sup { font-weight: 800; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rc-sub { font-size: 10px; font-weight: 700; color: var(--taupe); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rc-pieces { flex: none; font-size: 11px; font-weight: 800; color: var(--taupe); background: rgba(156, 123, 107, 0.1); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  .chev { flex: none; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; transition: transform 0.2s; color: var(--taupe); }
  .chev.flip { transform: rotate(-90deg); }

  .rc-sell { display: flex; align-items: center; gap: 10px; margin-top: 11px; }
  .rc-bar { position: relative; flex: 1; height: 7px; border-radius: 999px; background: rgba(156, 123, 107, 0.16); overflow: hidden; }
  .rc-bar i { position: absolute; inset-inline-start: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--gold), var(--burgundy)); border-radius: 999px; }
  .rc-pct { flex: none; font-size: 10.5px; font-weight: 800; color: var(--taupe); font-variant-numeric: tabular-nums; }

  .rc-stats { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 11px; border-top: 1px solid var(--line); padding-top: 10px; }
  .rc-stats .stat { display: flex; flex-direction: column; gap: 2px; text-align: center; border-inline-start: 1px solid var(--line); }
  .rc-stats .stat:first-child { border-inline-start: none; }
  .rc-stats .k { font-size: 9.5px; font-weight: 700; color: var(--taupe); }
  .rc-stats b { font-size: 12px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .rc-stats b.good { color: var(--good); }
  .rc-stats b.bad { color: var(--burgundy); }

  .rc-foot { display: flex; align-items: center; gap: 10px; margin-top: 9px; flex-wrap: wrap; }
  .rc-auto { flex: none; font-size: 9.5px; font-weight: 800; color: var(--taupe); background: rgba(156, 123, 107, 0.1); border-radius: 999px; padding: 3px 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .rc-note { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 10.5px; font-weight: 600; color: var(--taupe); }
  .rc-note span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .lines { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; display: flex; flex-direction: column; gap: 5px; }
  .line { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }
  .ln-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
  .ln-q { flex: none; color: var(--taupe); font-variant-numeric: tabular-nums; }
  .ln-cost { flex: none; font-weight: 800; color: var(--burgundy); }

  /* ---------- الموردون / الموديلات ---------- */
  :global(.sup), :global(.mdl) {
    position: relative; padding: 13px 14px; border-radius: var(--r-md);
    border: 1px solid var(--line-2); overflow: hidden;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.7), rgba(251, 243, 238, 0.5));
  }
  :global(.sup)::before, :global(.mdl)::before {
    content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px;
    background: linear-gradient(180deg, var(--gold), var(--burgundy)); opacity: 0.7;
  }
  .sup-head, .mdl-head { display: flex; align-items: center; gap: 10px; }
  .sup-avatar { flex: none; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; color: #fff; background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep)); }
  .mdl-ic { flex: none; width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: rgba(181, 73, 91, 0.1); border: 1px solid rgba(181, 73, 91, 0.16); }
  .sup-id, .mdl-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .sup-name, .mdl-name { font-weight: 800; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sup-meta, .mdl-meta { font-size: 10px; font-weight: 700; color: var(--taupe); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .sup-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 12px; margin-top: 11px; border-top: 1px solid var(--line); padding-top: 10px; }
  .sup-stats .stat { display: flex; flex-direction: column; gap: 1px; }
  .sup-stats .k { font-size: 9.5px; font-weight: 700; color: var(--taupe); }
  .sup-stats b { font-size: 12.5px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .sup-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .sup-foot b { font-size: 12.5px; font-weight: 800; }

  .mdl-profit { flex: none; display: flex; flex-direction: column; gap: 1px; text-align: center; }
  .mdl-profit .k { font-size: 9px; font-weight: 700; color: var(--taupe); }
  .mdl-profit b { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .mdl-cost { display: flex; align-items: center; gap: 7px; margin-top: 9px; font-size: 11px; color: var(--taupe); }
  .mdl-cost .k { font-weight: 700; }
  .cost-from, .cost-to { font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
  .mdl-cost .arrow { color: var(--gold); font-weight: 900; }
  .delta { margin-inline-start: auto; font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
  .delta.up { color: var(--burgundy); background: rgba(181, 73, 91, 0.1); }
  .delta.down { color: var(--good); background: rgba(78, 138, 95, 0.12); }

  .good { color: var(--good) !important; }
  .bad { color: var(--burgundy) !important; }
  .warn { color: var(--warn) !important; }

  .cmp { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
  .cmp-title { font-size: 10.5px; font-weight: 800; color: var(--taupe); margin-bottom: 6px; }
  .cmp-row { display: flex; align-items: center; gap: 8px; font-size: 11.5px; padding: 5px 7px; border-radius: 8px; }
  .cmp-row.best { background: rgba(78, 138, 95, 0.1); }
  .cmp-sup { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmp-qty { flex: none; font-size: 10px; color: var(--taupe); }
  .cmp-cost { font-weight: 800; color: var(--burgundy); font-variant-numeric: tabular-nums; }
  .cmp-best { flex: none; font-size: 9px; font-weight: 800; color: var(--good); background: rgba(78, 138, 95, 0.14); border-radius: 999px; padding: 2px 7px; }

  .btn { font-family: inherit; font-size: 12.5px; font-weight: 700; border-radius: var(--r-md); padding: 0 12px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); display: inline-flex; align-items: center; gap: 5px; }
  .btn.ghost { background: transparent; }
</style>
