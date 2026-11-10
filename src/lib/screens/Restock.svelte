<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Pick from '../components/Pick.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import { loadProducts, addLot, addProduct, modelGroupKey, typeChain, modelOptions, addModelOption, getSetting, setSetting, createReceipt, deleteReceipt, consumeAny, syncCardFromLots, syncCardSuppliers, SIZE_RUNS, hexForColor } from '../db.js';
  import { fmtNum, buzz, iqd, baghdadLocalInput, isoFromBaghdadLocal } from '../utils.js';
  import { toastOk, toastErr, celebrateAt } from '../store.js';

  const NOCOLOR = 'بلا لون';

  let { preselect = '', ondone = () => {} } = $props();

  let models = $state([]);
  let loading = $state(true);
  let q = $state('');
  let picked = $state('');
  let opts = $state({ colors: [], sizes: {} });
  let suppliers = $state([]);
  let selColors = $state([]);
  let byColor = $state({});     // label → { sizeKey: الإجمالي الجديد }
  let category = $state('نسائية');
  let supplier = $state('');
  let cost = $state('');
  let price = $state('');
  let arrival = $state(baghdadLocalInput());
  let note = $state('');
  let addSupOpen = $state(false);
  let addSupVal = $state('');
  let addColorOpen = $state(false);
  let addColorLabel = $state('');
  let addColorHex = $state('var(--taupe)');
  let saving = $state(false);

  function group(ps) {
    const map = new Map();
    for (const p of ps) {
      const mid = modelGroupKey(p);
      let m = map.get(mid);
      if (!m) { m = { modelId: mid, chain: '', photo: null, colors: new Map(), qty: 0, supplier: '', cost: 0, price: 0, lead: p, meta: '' }; map.set(mid, m); }
      m.qty += Number(p.qty) || 0;
      if (!m.photo && p.photo) m.photo = p.photo;
      if (!m.chain) m.chain = typeChain(p) || p.name || 'موديل';
      if (!m.meta) m.meta = [p.category, p.material, ...(Array.isArray(p.seasons) && p.seasons.length ? p.seasons : (p.season ? [p.season] : []))].filter(Boolean).join(' · ');
      if (!m.supplier && p.supplier) m.supplier = p.supplier;
      if (!m.cost && p.cost) m.cost = p.cost;
      if (!m.price && p.price) m.price = p.price;
      const c = (p.color || '').trim();
      if (!m.colors.has(c)) m.colors.set(c, []);
      m.colors.get(c).push(p);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }

  onMount(async () => {
    const [ps, o, sup] = await Promise.all([loadProducts(), modelOptions(), getSetting('suppliers', [])]);
    models = group(ps);
    opts = o;
    suppliers = sup || [];
    loading = false;
    if (preselect) pickModel(preselect);
  });

  async function refreshOpts() { opts = await modelOptions(); }

  const filtered = $derived(models.filter((m) => !q.trim() || [m.chain, ...m.colors.keys()].join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  const chosen = $derived(models.find((m) => m.modelId === picked) || null);
  const palette = $derived([
    ...opts.colors,
    ...selColors.filter((c) => c !== NOCOLOR && !opts.colors.some((o) => o.label === c)).map((c) => ({ label: c, hex: 'var(--taupe)' }))
  ]);
  const baseSizes = $derived((opts.sizes && opts.sizes[category]) || SIZE_RUNS[category] || SIZE_RUNS['نسائية']);

  const colorKeyOf = (label) => (label === NOCOLOR ? '' : label);
  const colorPieces = (label) => Object.values(byColor[label] || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  function colorDiff(label) {
    if (!chosen) return 0;
    const cards = chosen.colors.get(colorKeyOf(label)) || [];
    const cur = byColor[label] || {};
    let d = 0;
    for (const card of cards) {
      const sz = String(card.size || '').trim() || '—';
      d += (Number(cur[sz]) || 0) - (Number(card.qty) || 0);
    }
    for (const [sz, qv] of Object.entries(cur)) {
      if ((Number(qv) || 0) > 0 && !cards.some((c) => (String(c.size || '').trim() || '—') === sz)) d += Number(qv) || 0;
    }
    return d;
  }
  const totalIn = $derived(chosen ? selColors.reduce((a, l) => a + Math.max(0, colorDiff(l)), 0) : 0);

  function pickModel(mid) {
    const m = models.find((x) => x.modelId === mid);
    if (!m) return;
    picked = mid;
    selColors = [];
    byColor = {};
    for (const [colorKey, cards] of m.colors) {
      const label = colorKey || NOCOLOR;
      selColors.push(label);
      const map = {};
      for (const c of cards) map[String(c.size || '').trim() || '—'] = Number(c.qty) || 0;
      byColor[label] = map;
    }
    category = m.lead.category || 'نسائية';
    supplier = m.supplier || (suppliers[0] || '');
    cost = m.cost ? String(m.cost) : '';
    price = m.price ? String(m.price) : '';
    arrival = baghdadLocalInput();
    note = ''; addSupOpen = false; addColorOpen = false;
    buzz(8);
  }

  function toggleColor(label) {
    if (selColors.includes(label)) selColors = selColors.filter((c) => c !== label);
    else { selColors = [...selColors, label]; if (!byColor[label]) byColor[label] = {}; }
    buzz(6);
  }

  async function addSupplier() {
    const v = addSupVal.trim();
    if (!v) return;
    const reg = (await getSetting('suppliers', [])) || [];
    if (!reg.includes(v)) await setSetting('suppliers', [...reg, v]);
    suppliers = [...new Set([...suppliers, v])];
    supplier = v;
    addSupOpen = false; addSupVal = '';
    buzz(8);
  }

  async function addColor() {
    const v = addColorLabel.trim();
    if (!v) return;
    await addModelOption('colors', { label: v, hex: addColorHex || 'var(--taupe)' }, null);
    await refreshOpts();
    if (!selColors.includes(v)) { selColors = [...selColors, v]; byColor = { ...byColor, [v]: byColor[v] || {} }; }
    addColorOpen = false; addColorLabel = ''; addColorHex = 'var(--taupe)';
    buzz(8);
  }

  async function save() {
    const m = chosen;
    if (!m) return;
    const c = iqd(cost), pr = iqd(price);
    if (c <= 0) { toastErr('سعر التكلفة مطلوب'); return; }
    if (pr <= 0) { toastErr('سعر البيع مطلوب'); return; }

    const plan = [];
    for (const label of selColors) {
      const colorKey = colorKeyOf(label);
      const cards = m.colors.get(colorKey) || [];
      const cur = byColor[label] || {};
      for (const card of cards) {
        const sz = String(card.size || '').trim() || '—';
        const next = Number(cur[sz]) || 0;
        plan.push({ card, colorKey, sizeKey: sz, next, diff: next - (Number(card.qty) || 0) });
      }
      for (const [sz, qv] of Object.entries(cur)) {
        const n = Number(qv) || 0;
        if (n <= 0) continue;
        if (cards.some((card) => (String(card.size || '').trim() || '—') === sz)) continue;
        plan.push({ card: null, colorKey, sizeKey: sz, next: n, diff: n });
      }
    }
    const changes = plan.filter((x) => x.diff !== 0);
    if (!changes.length) { toastErr('لا تغيير في الكميات'); return; }

    saving = true;
    const arrivalIso = isoFromBaghdadLocal(arrival) || new Date().toISOString();
    const sup = supplier.trim();
    const noteTxt = `دفعة جديدة — ${sup || 'بدون مورد'}`;
    let receiptId = null;
    try {
      const rec = await createReceipt({ supplier: sup, invoice: '', date: arrivalIso, note: note.trim(), source: 'restock' });
      receiptId = rec.id;
      let pieces = 0, cardsAdded = 0;
      for (const x of changes) {
        if (x.card) {
          if (x.diff > 0) {
            await addLot({ sku: x.card.sku, supplier: sup, cost: c, price: pr, qty: x.diff, receivedAt: arrivalIso, note: noteTxt, receiptId });
            pieces += x.diff;
          } else {
            await consumeAny(x.card.sku, -x.diff);
            await syncCardFromLots(x.card.sku);
          }
          await syncCardSuppliers(x.card.sku);
        } else {
          const size = x.sizeKey === '—' ? '' : x.sizeKey;
          await addProduct({
            name: m.lead.name, category: m.lead.category,
            type: m.lead.type || '', typeSub: m.lead.typeSub || '', typeSub2: m.lead.typeSub2 || '', typeSub3: m.lead.typeSub3 || '',
            season: m.lead.season || '', material: m.lead.material || '',
            color: x.colorKey, size, qty: x.next, cost: c, price: pr, supplier: sup, supplierAt: new Date().toISOString(),
            modelId: picked, photo: m.photo || null
          }, { moveNote: noteTxt, receiptId });
          pieces += x.next; cardsAdded++;
        }
      }
      if (sup) {
        const reg = (await getSetting('suppliers', [])) || [];
        if (!reg.includes(sup)) await setSetting('suppliers', [...reg, sup]);
      }
      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '📦');
      toastOk(`تم الاستلام — ${fmtNum(pieces)} قطعة${cardsAdded ? ` (${fmtNum(cardsAdded)} بطاقة جديدة)` : ''} · ${rec.no}`, 'success', 5200);
      ondone();
    } catch (e) {
      if (receiptId) deleteReceipt(receiptId);
      toastErr('تعذر حفظ الدفعة');
      console.error(e);
    } finally {
      saving = false;
    }
  }
</script>

<div class="stack" style="gap:12px">
  {#if loading}
    <div class="muted small" style="text-align:center; padding:24px">…جاري التحميل</div>
  {:else if !picked}
    <Glass class="search" radius="var(--r-md)">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث بالموديل أو اللون…" bind:value={q} />
    </Glass>
    {#if filtered.length}
      <div class="mgrid">
        {#each filtered as m (m.modelId)}
          <button class="mcard" onclick={() => pickModel(m.modelId)}>
            <span class="m-img">{#if m.photo}<img src={m.photo} alt="" />{:else}<Icon name="image" size={22} color="var(--taupe)" />{/if}</span>
            <span class="m-chain">{m.chain}</span>
            <span class="m-qty">{fmtNum(m.qty)} على الرف</span>
          </button>
        {/each}
      </div>
    {:else}
      <EmptyState title="لا موديلات" subtitle="سجّلي موديلاً أولاً — ثم ارجعي لاستلام دفعة" icon="box" />
    {/if}
  {:else}
    <div class="row" style="justify-content:space-between; align-items:center">
      <button class="btn ghost" style="min-height:36px" onclick={() => { picked = ''; buzz(6); }}><Icon name="back" size={15} /> رجوع</button>
      <span class="bold small">استلام دفعة</span>
    </div>

    <Glass class="picked">
      <span class="m-img big">{#if chosen.photo}<img src={chosen.photo} alt="" />{:else}<Icon name="image" size={26} color="var(--taupe)" />{/if}</span>
      <div style="flex:1; min-width:0">
        <div class="bold">{chosen.chain}</div>
        {#if chosen.meta}<div class="muted tiny">{chosen.meta}</div>{/if}
        <div class="muted tiny">على الرف {fmtNum(chosen.qty)} قطعة{chosen.supplier ? ` · ${chosen.supplier}` : ''}</div>
      </div>
    </Glass>

    <div class="field">
      <label>المورد لهذه الدفعة</label>
      {#if suppliers.length}
        <Pick bind:value={supplier} placeholder="اختاري المورد…" options={suppliers} />
      {:else}
        <input class="input" bind:value={supplier} placeholder="مثال: هاي مول — أبو علي" />
        <p class="muted tiny" style="margin:4px 2px 0">سجّلي مورديك من الإعدادات لتظهروا قائمة هنا.</p>
      {/if}
      <button type="button" class="chip add" style="margin-top:8px" onclick={() => (addSupOpen = !addSupOpen)}>+ مورد جديد</button>
      {#if addSupOpen}
        <div class="row" style="gap:6px; margin-top:6px">
          <input class="input" bind:value={addSupVal} placeholder="اسم المورد…" style="flex:1" onkeydown={(e) => e.key === 'Enter' && addSupplier()} />
          <button type="button" class="btn" style="min-height:44px; flex:none" onclick={addSupplier}>إضافة</button>
        </div>
      {/if}
    </div>

    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>سعر التكلفة (د.ع)</label>
        <input class="input" bind:value={cost} inputmode="decimal" placeholder="0" />
      </div>
      <div class="field" style="flex:1">
        <label>سعر البيع (د.ع)</label>
        <input class="input" bind:value={price} inputmode="decimal" placeholder="0" />
      </div>
    </div>
    <div class="field">
      <label>وقت الوصول <span class="muted tiny">(بتوقيت بغداد)</span></label>
      <div class="row" style="gap:8px; align-items:center">
        <input class="input ts-input" type="datetime-local" bind:value={arrival} max={baghdadLocalInput()} />
        <button type="button" class="chip" onclick={() => (arrival = baghdadLocalInput())}>الآن</button>
      </div>
    </div>
    <div class="field">
      <label>ملاحظة (اختياري)</label>
      <input class="input" bind:value={note} placeholder="اختياري…" />
    </div>

    <Glass class="summary">
      <span class="sum-k">الحالي</span>
      <b class="sum-v muted">{fmtNum(chosen.qty)}</b>
      <span class="sum-arrow">←</span>
      <span class="sum-k">واصل الآن</span>
      <b class="sum-v">{fmtNum(totalIn)}</b>
      <span class="muted tiny" style="margin-inline-start:auto">{supplier || 'بدون مورد'}</span>
    </Glass>

    <ColorSwatches
      colors={palette}
      multi={true}
      selected={selColors}
      onselect={toggleColor}
      label="الألوان التي وصلت"
      hint="اختاري من الدوائر"
    />
    <button type="button" class="chip add" onclick={() => (addColorOpen = !addColorOpen)}>+ لون</button>
    {#if addColorOpen}
      <div class="row" style="gap:6px; margin-top:6px">
        <input type="color" bind:value={addColorHex} aria-label="اختاري لوناً" class="add-hex" />
        <input class="input" bind:value={addColorLabel} placeholder="اسم اللون…" style="flex:1" onkeydown={(e) => e.key === 'Enter' && addColor()} />
        <button type="button" class="btn" style="min-height:44px; flex:none" onclick={addColor}>إضافة</button>
      </div>
    {/if}

    <div class="sizes-title">الكمية الجديدة <span class="muted tiny">— الإجمالي بعد الاستلام (الحالي مُعبّأ)</span></div>
    {#if selColors.length}
      <div class="stack" style="gap:10px">
        {#each selColors as color (color)}
          <div class="color-block">
            <div class="cb-head">
              <i class="cb-dot" style="background:{color === NOCOLOR ? 'transparent' : hexForColor(color, palette)}"></i>
              <span class="bold">{color}</span>
              <span class="cb-count" class:has={colorDiff(color) !== 0}>
                {colorDiff(color) > 0 ? `+${fmtNum(colorDiff(color))}` : colorDiff(color) < 0 ? fmtNum(colorDiff(color)) : 'لا تغيير'}
              </span>
            </div>
            <SizeQtyGrid sizes={baseSizes} bind:value={byColor[color]} category={category} onAddSize={refreshOpts} />
          </div>
        {/each}
      </div>
    {:else}
      <div class="cb-empty">اختاري لوناً من الدوائر أولاً</div>
    {/if}

    <button class="btn primary lg block" onclick={save} disabled={saving}>
      <Icon name="check" size={20} /> حفظ الاستلام{totalIn > 0 ? ` — ${fmtNum(totalIn)} قطعة` : ''}
    </button>
  {/if}
</div>

<style>
  :global(.search) { display: flex; align-items: center; gap: 8px; padding: 0 14px; height: 50px; }
  :global(.search) input { flex: 1; border: none; outline: none; background: transparent; font-family: inherit; font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .mgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding-bottom: 80px; }
  .mcard { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 12px; border: 1px solid var(--line-2); background: var(--glass, rgba(255,255,255,0.5)); cursor: pointer; text-align: center; font-family: inherit; }
  .mcard:active { transform: scale(0.97); }
  .m-img { width: 100%; aspect-ratio: 1; border-radius: 9px; background: var(--ivory, var(--ivory)); display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none; }
  .m-img img { width: 100%; height: 100%; object-fit: cover; }
  .m-img.big { width: 60px; height: 60px; aspect-ratio: auto; border-radius: 14px; }
  .m-chain { font-size: 11px; font-weight: 700; color: var(--ink); line-height: 1.25; max-height: 2.5em; overflow: hidden; }
  .m-qty { font-size: 11px; color: var(--taupe); }
  :global(.picked) { padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
  :global(.summary) { padding: 11px 14px; display: flex; align-items: center; gap: 8px; }
  .sum-k { font-size: 11px; font-weight: 700; color: var(--taupe); }
  .sum-v { font-size: 15px; font-weight: 900; color: var(--burgundy); font-variant-numeric: tabular-nums; }
  .sum-v.muted { color: var(--ink-2); }
  .sum-arrow { color: var(--gold); font-weight: 900; }
  .sizes-title { font-weight: 900; font-size: 14px; color: var(--ink); }
  .color-block { border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px 12px; background: rgba(255, 255, 255, 0.28); }
  .cb-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .cb-dot { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; }
  .cb-count { margin-inline-start: auto; font-size: 11px; font-weight: 800; color: var(--taupe); background: rgba(122, 46, 58, 0.07); border-radius: 999px; padding: 3px 9px; }
  .cb-count.has { color: var(--good); background: rgba(78, 138, 95, 0.12); }
  .cb-empty { font-size: 12.5px; font-weight: 700; color: var(--taupe); border: 1.5px dashed var(--line-2); border-radius: var(--r-md); padding: 14px; text-align: center; }
  .add-hex { width: 44px; height: 44px; padding: 0; border: 1px solid var(--line-2); border-radius: 10px; background: #fff; flex: none; }
  .ts-input { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; }
  .chip.add { border-style: dashed; border-color: var(--burgundy); color: var(--burgundy); background: rgba(181, 73, 91, 0.06); font-size: 12.5px; padding: 7px 13px; }
  .btn { font-family: inherit; font-size: 12.5px; font-weight: 700; border-radius: var(--r-md); padding: 0 12px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); display: inline-flex; align-items: center; gap: 5px; }
  .btn.ghost { background: transparent; }
</style>
