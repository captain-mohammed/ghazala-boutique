<script>
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { loadProducts, addLot, addProduct, modelGroupKey, typeChain, createReceipt, deleteReceipt, getSetting, setSetting, consumeAny, syncCardFromLots, syncCardSuppliers } from '../db.js';
  import { fmtNum, buzz, iqd, baghdadLocalInput, isoFromBaghdadLocal } from '../utils.js';
  import { toastOk, toastErr, celebrateAt } from '../store.js';

  let { preselect = '', ondone = () => {} } = $props();

  let models = $state([]);
  let loading = $state(true);
  let q = $state('');
  let picked = $state('');
  let qty = $state({});        // sku → الكمية الإجمالية الجديدة (نص)
  let supplier = $state('');
  let cost = $state('');
  let price = $state('');
  let arrival = $state(baghdadLocalInput());
  let note = $state('');
  let newColor = $state('');
  let newSize = $state('');
  let newQty = $state('');
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
    const ps = await loadProducts();
    models = group(ps);
    loading = false;
    if (preselect) pickModel(preselect);
  });

  const filtered = $derived(models.filter((m) => !q.trim() || [m.chain, ...m.colors.keys()].join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  const chosen = $derived(models.find((m) => m.modelId === picked) || null);
  const totalIn = $derived(chosen ? [...chosen.colors.values()].flat().reduce((a, c) => a + Math.max(0, (Number(qty[c.sku]) || 0) - (Number(c.qty) || 0)), 0) + (Number(newQty) || 0) : 0);

  function pickModel(mid) {
    const m = models.find((x) => x.modelId === mid);
    if (!m) return;
    picked = mid;
    qty = {};
    for (const cards of m.colors.values()) for (const c of cards) qty[c.sku] = String(Number(c.qty) || 0);
    supplier = m.supplier || '';
    cost = m.cost ? String(m.cost) : '';
    price = m.price ? String(m.price) : '';
    arrival = baghdadLocalInput();
    note = ''; newColor = ''; newSize = ''; newQty = '';
    buzz(8);
  }

  const delta = (c) => (Number(qty[c.sku]) || 0) - (Number(c.qty) || 0);

  async function save() {
    const m = chosen;
    if (!m) return;
    const c = iqd(cost), pr = iqd(price);
    const cards = [...m.colors.values()].flat();
    const diffs = cards.map((card) => ({ sku: card.sku, diff: delta(card) })).filter((x) => x.diff !== 0);
    const hasNew = Number(newQty) > 0;
    if (!diffs.length && !hasNew) { toastErr('لا تغيير في الكميات'); return; }
    if (c <= 0) { toastErr('سعر التكلفة مطلوب'); return; }
    if (pr <= 0) { toastErr('سعر البيع مطلوب'); return; }
    if (hasNew && !newColor.trim() && !newSize.trim()) { toastErr('اكتبي لوناً أو مقاساً للبطاقة الجديدة'); return; }
    saving = true;
    const arrivalIso = isoFromBaghdadLocal(arrival) || new Date().toISOString();
    const sup = supplier.trim();
    const noteTxt = `دفعة جديدة — ${sup || 'بدون مورد'}`;
    let receiptId = null;
    try {
      const rec = await createReceipt({ supplier: sup, invoice: '', date: arrivalIso, note: note.trim(), source: 'restock' });
      receiptId = rec.id;
      let pieces = 0, cardsAdded = 0;
      for (const { sku, diff } of diffs) {
        if (diff > 0) {
          await addLot({ sku, supplier: sup, cost: c, price: pr, qty: diff, receivedAt: arrivalIso, note: noteTxt, receiptId });
          pieces += diff;
        } else {
          await consumeAny(sku, -diff);
          await syncCardFromLots(sku);
        }
        await syncCardSuppliers(sku);
      }
      if (hasNew) {
        const n = Math.round(Number(newQty) || 0);
        await addProduct({
          name: m.lead.name, category: m.lead.category,
          type: m.lead.type || '', typeSub: m.lead.typeSub || '', typeSub2: m.lead.typeSub2 || '', typeSub3: m.lead.typeSub3 || '',
          season: m.lead.season || '', material: m.lead.material || '',
          color: newColor.trim(), size: newSize.trim(),
          cost: c, price: pr, qty: n, supplier: sup, supplierAt: new Date().toISOString(),
          modelId: picked, photo: m.photo || null
        }, { moveNote: noteTxt, receiptId });
        pieces += n; cardsAdded++;
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

    <div class="row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>المورد لهذه الدفعة</label>
        <input class="input" bind:value={supplier} placeholder="منين شريتِ؟" />
      </div>
      <div class="field" style="flex:1">
        <label>وقت الوصول</label>
        <input class="input" type="datetime-local" bind:value={arrival} max={baghdadLocalInput()} />
      </div>
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
      <label>ملاحظة (اختياري)</label>
      <input class="input" bind:value={note} placeholder="اختياري…" />
    </div>

    <Glass class="summary">
      <span class="sum-k">واصل الآن</span>
      <b class="sum-v">{fmtNum(totalIn)} قطعة</b>
      <span class="muted tiny">{supplier || 'بدون مورد'}</span>
    </Glass>

    <div class="sizes-title">الكمية الجديدة <span class="muted tiny">— الإجمالي بعد الاستلام (الحالي معروض بجانبه)</span></div>
    <div class="stack" style="gap:8px">
      {#each [...chosen.colors.entries()] as [color, cards] (color)}
        <Glass class="color-block">
          <div class="cb-head"><span class="bold small">{color || 'بلا لون'}</span></div>
          {#each cards as c (c.sku)}
            <div class="size-row">
              <span class="sz">{c.size || '—'}</span>
              <span class="on-shelf">على الرف {fmtNum(c.qty)}</span>
              <input class="input qin" type="number" min="0" inputmode="numeric" bind:value={qty[c.sku]} placeholder="0" />
              {#if delta(c) > 0}<span class="dlt up">+{fmtNum(delta(c))}</span>{:else if delta(c) < 0}<span class="dlt down">{fmtNum(delta(c))}</span>{/if}
            </div>
          {/each}
        </Glass>
      {/each}
    </div>

    <Glass class="new-var">
      <div class="bold small" style="margin-bottom:8px">+ لون أو مقاس جديد</div>
      <div class="row" style="gap:8px">
        <input class="input" bind:value={newColor} placeholder="لون" style="flex:1" />
        <input class="input" bind:value={newSize} placeholder="مقاس" style="flex:1" />
        <input class="input" bind:value={newQty} placeholder="كمية" inputmode="numeric" style="width:76px" />
      </div>
    </Glass>

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
  .m-img { width: 100%; aspect-ratio: 1; border-radius: 9px; background: var(--ivory, #FBF3EE); display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none; }
  .m-img img { width: 100%; height: 100%; object-fit: cover; }
  .m-img.big { width: 60px; height: 60px; aspect-ratio: auto; border-radius: 14px; }
  .m-chain { font-size: 11px; font-weight: 700; color: var(--ink); line-height: 1.25; max-height: 2.5em; overflow: hidden; }
  .m-qty { font-size: 10px; color: var(--taupe); }
  :global(.picked) { padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
  :global(.summary) { padding: 11px 14px; display: flex; align-items: center; gap: 10px; }
  .sum-k { font-size: 12px; font-weight: 700; color: var(--taupe); }
  .sum-v { font-size: 15px; font-weight: 900; color: var(--burgundy); font-variant-numeric: tabular-nums; }
  .sizes-title { font-weight: 900; font-size: 14px; color: var(--ink); }
  :global(.color-block) { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .cb-head { margin-bottom: 2px; }
  .size-row { display: flex; align-items: center; gap: 10px; }
  .sz { flex: none; width: 40px; font-weight: 800; font-size: 13px; color: var(--ink); }
  .on-shelf { flex: 1; font-size: 11px; color: var(--taupe); }
  .qin { width: 78px; min-height: 44px; text-align: center; flex: none; }
  .dlt { flex: none; min-width: 42px; text-align: center; font-size: 11px; font-weight: 800; padding: 3px 7px; border-radius: 999px; }
  .dlt.up { color: var(--good); background: rgba(78,138,95,0.12); }
  .dlt.down { color: var(--burgundy); background: rgba(181,73,91,0.1); }
  :global(.new-var) { padding: 12px 14px; }
  .btn { font-family: inherit; font-size: 12.5px; font-weight: 700; border-radius: var(--r-md); padding: 0 12px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); display: inline-flex; align-items: center; gap: 5px; }
  .btn.ghost { background: transparent; }
</style>
