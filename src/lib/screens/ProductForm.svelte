<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import { db, addProduct, updateProduct, modelOptions, hexForColor, SIZE_RUNS, modelKey } from '../db.js';
  import { fmtIQD, buzz, iqd, fileToPhotoDataUrl } from '../utils.js';
  import { toastOk, toastErr, celebrateAt } from '../store.js';

  let { product = null, photo = null, ondone = () => {} } = $props();

  const editing = !!product;
  const NOCOLOR = 'بلا لون';

  let name = $state(product?.name ?? '');
  let category = $state(product?.category ?? '');
  let type = $state(product?.type ?? '');
  let brand = $state(product?.brand ?? '');
  let season = $state(product?.season ?? '');
  let material = $state(product?.material ?? '');
  let cost = $state(product?.cost ?? '');
  let price = $state(product?.price ?? '');
  let notes = $state(product?.notes ?? '');

  /* multi-color × multi-size: one card per selected color */
  let selColors = $state([]); // color labels ('' stored as NOCOLOR)
  let byColor = $state({});   // label → { size: qty }
  let siblings = $state([]);  // loaded existing variants (edit mode)

  let opts = $state({ categories: [], types: [], seasons: [], materials: [], colors: [] });
  (async () => {
    opts = await modelOptions();
    if (!category) category = opts.categories[0] || 'نسائية';
    if (product) {
      const all = await db.products.toArray();
      const group = all.filter((x) =>
        x.name.trim().toLowerCase() === product.name.trim().toLowerCase() &&
        x.category === product.category
      );
      const cs = [];
      const bc = {};
      for (const x of group) {
        const c = (x.color || '').trim() || NOCOLOR;
        const s = String(x.size || '').trim() || '—';
        if (!bc[c]) { bc[c] = {}; cs.push(c); }
        bc[c][s] = x.qty || 0;
      }
      selColors = cs;
      byColor = bc;
      siblings = group;
    }
  })();

  /* legacy free-typed colors not in the owner palette — still selectable/removable */
  const palette = $derived([
    ...opts.colors,
    ...selColors
      .filter((c) => c !== NOCOLOR && !opts.colors.some((o) => o.label === c))
      .map((c) => ({ label: c, hex: '#9C7B6B' }))
  ]);

  let img = $state(photo || product?.photo || null);
  let camInput;

  async function onPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      img = await fileToPhotoDataUrl(f, 640);
      buzz(10);
    } catch { toastErr('تعذّرت قراءة الصورة'); }
  }

  function toggleColor(label) {
    if (selColors.includes(label)) {
      selColors = selColors.filter((c) => c !== label);
      const m = { ...byColor };
      delete m[label];
      byColor = m;
    } else {
      selColors = [...selColors, label];
      byColor = { ...byColor, [label]: byColor[label] || {} };
    }
  }

  const baseSizes = $derived(SIZE_RUNS[category] || SIZE_RUNS['نسائية']);
  const colorPieces = (c) => Object.values(byColor[c] || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  const totalPieces = $derived(selColors.reduce((a, c) => a + colorPieces(c), 0));
  const totalSizes = $derived(selColors.reduce((a, c) => a + Object.values(byColor[c] || {}).filter((n) => n > 0).length, 0));

  const profit = $derived(Math.max(0, iqd(price) - iqd(cost)));
  const margin = $derived(iqd(price) > 0 ? Math.round((profit / iqd(price)) * 100) : 0);

  /* everything is required except notes (and the photo is optional) */
  const missing = $derived.by(() => {
    const m = [];
    if (!name.trim()) m.push('اسم الموديل');
    if (!category) m.push('التصنيف');
    if (!type) m.push('النوع');
    if (!season) m.push('الموسم');
    if (!selColors.length) m.push('اللون');
    if (!material) m.push('المادة');
    if (iqd(cost) <= 0) m.push('التكلفة');
    if (iqd(price) <= 0) m.push('سعر البيع');
    /* editing may end at zero pieces on purpose — that's exactly how «نفد» is saved */
    if (!editing && totalPieces <= 0) m.push('مقاس واحد بكمية على الأقل');
    return m;
  });
  const valid = $derived(missing.length === 0);
  let tried = $state(false);

  const isMissing = (label) => tried && missing.includes(label);
  const bad = (label) => (isMissing(label) ? { 'border-color': 'rgba(181,73,91,0.6)', 'box-shadow': '0 0 0 3px rgba(181,73,91,0.1)' } : {});

  /* «نفد» — wipe every size quantity of every color, keep the cards (0 pieces) */
  function zeroAllQty() {
    buzz([12, 30, 12]);
    byColor = Object.fromEntries(
      Object.entries(byColor).map(([c, m]) => [c, Object.fromEntries(Object.keys(m).map((s) => [s, 0]))])
    );
    toastOk('كل الكميات صارت صفر — اضغطي «حفظ التعديلات» لتثبيت نفد');
  }

  async function save() {
    if (!valid) {
      tried = true;
      buzz([30, 40, 30]);
      toastErr(`مطلوب: ${missing.slice(0, 3).join('، ')}${missing.length > 3 ? '…' : ''}`);
      return;
    }
    try {
      const base = {
        name: name.trim(), category, type, brand: brand.trim(),
        season, material, cost: iqd(cost), price: iqd(price), photo: img, notes: notes.trim()
      };
      const all = await db.products.toArray();
      const idx = new Map(all.map((p) => [modelKey(p), p]));
      const touched = new Set();
      let updated = 0, created = 0;

      for (const c of selColors) {
        const color = c === NOCOLOR ? '' : c;
        for (const [rawSize, rawQty] of Object.entries(byColor[c] || {})) {
          const q = Math.max(0, Math.round(Number(rawQty) || 0));
          const size = String(rawSize).trim();
          const sz = size === '—' ? '' : size;
          const twin = idx.get(modelKey({ name: base.name, category: base.category, size: sz, color }));
          if (twin) {
            if (editing) {
              /* pieces kept/changed on the shelf don't reset the راكد clock —
                 only a real restock (qty increase) does, and updateProduct handles that */
              await updateProduct(twin.sku, { ...base, color, size: sz, qty: q });
            } else if (q > 0) {
              await updateProduct(twin.sku, {
                qty: (twin.qty || 0) + q, cost: base.cost, price: base.price,
                type: twin.type || base.type, season: twin.season || base.season,
                material: twin.material || base.material, photo: twin.photo || base.photo
              });
            } else continue;
            touched.add(twin.sku);
            updated++;
          } else if (q > 0) {
            const p = await addProduct({ ...base, color, size: sz, qty: q });
            idx.set(modelKey(p), p);
            touched.add(p.sku);
            created++;
          }
        }
      }

      if (editing) {
        /* the form is the truth — variants removed from the grid go to zero */
        for (const x of siblings) {
          if (!touched.has(x.sku) && (x.qty || 0) !== 0) {
            await updateProduct(x.sku, { qty: 0 });
            updated++;
          }
        }
      }

      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
      const parts = [];
      if (updated) parts.push(`${updated} بطاقة ${editing ? 'محفوظة' : 'اندماجت'}`);
      if (created) parts.push(`${created} جديدة`);
      toastOk(`${editing ? 'تم الحفظ' : 'تمت الإضافة'} — ${totalPieces} قطعة (${parts.join(' • ')})`);
      ondone();
    } catch (e) {
      toastErr('حدث خطأ أثناء الحفظ');
      console.error(e);
    }
  }
</script>

<div class="stack" style="gap:14px">
  <!-- photo beside the name (right side in RTL) — optional -->
  <div class="row nm-row" style="gap:12px">
    <div class="field" style="flex:1">
      <label>اسم الموديل *</label>
      <input class="input" style={bad('اسم الموديل')} bind:value={name} placeholder="مثال: بوت جلد أسود" />
    </div>
    <div class="field" style="flex:none">
      <label>الصورة <span class="muted tiny">(اختياري)</span></label>
      <div class="photo-wrap">
        <button type="button" class="photo-tile" class:has={!!img} onclick={() => camInput?.click()}>
          {#if img}
            <img src={img} alt="preview" />
            <span class="re-take"><Icon name="image" size={12} /> تغيير</span>
          {:else}
            <Icon name="image" size={24} color="var(--taupe)" />
            <span class="ph-txt">صوّري</span>
          {/if}
        </button>
        {#if img}<span class="ph-x-wrap"><button type="button" class="ph-x" aria-label="إزالة الصورة" onclick={() => { img = null; }}><Icon name="x" size={13} /></button></span>{/if}
        <input type="file" accept="image/*" capture="environment" style="display:none" bind:this={camInput} onchange={onPhoto} />
      </div>
    </div>
  </div>

  <div class="field">
    <label>التصنيف *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.categories as c (c)}
        <button type="button" class="chip" class:on={category === c} onclick={() => (category = c)}>{c}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label>النوع *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.types as t (t)}
        <button type="button" class="chip" class:on={type === t} onclick={() => (type = type === t ? '' : t)}>{t}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label>تصنيف الموسم *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.seasons as s (s)}
        <button type="button" class="chip" class:on={season === s} onclick={() => (season = season === s ? '' : s)}>{s}</button>
      {/each}
    </div>
  </div>

  <ColorSwatches
    colors={palette}
    multi={true}
    selected={selColors}
    onselect={toggleColor}
    label="اللون *"
    hint="اختاري لون أو أكثر"
  />
  {#if selColors.includes(NOCOLOR)}
    <div class="row" style="gap:6px">
      <span class="sp-nocolor">
        {NOCOLOR}
        <button onclick={() => toggleColor(NOCOLOR)} aria-label="إزالة بلا لون"><Icon name="x" size={11} /></button>
      </span>
    </div>
  {/if}
  {#if isMissing('اللون')}<span class="err-line">اختاري لوناً واحداً على الأقل</span>{/if}

  <div class="field">
    <label>المادة المصنوع منها *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.materials as m (m)}
        <button type="button" class="chip" class:on={material === m} onclick={() => (material = material === m ? '' : m)}>{m}</button>
      {/each}
    </div>
  </div>

  <div class="row" style="gap:10px">
    <div class="field" style="flex:1">
      <label>سعر التكلفة (د.ع) * <span class="muted tiny">— 18 = 18,000</span></label>
      <input class="input" style={bad('التكلفة')} bind:value={cost} inputmode="decimal" placeholder="0" />
    </div>
    <div class="field" style="flex:1">
      <label>سعر البيع (د.ع) * <span class="muted tiny">— 32 = 32,000</span></label>
      <input class="input" style={bad('سعر البيع')} bind:value={price} inputmode="decimal" placeholder="0" />
    </div>
  </div>

  {#if iqd(price) > 0 && iqd(cost) > 0}
    <Glass class="profit pop" radius="var(--r-md)">
      {#key profit}
        <span class="pnum" style="color:{margin >= 30 ? 'var(--good)' : 'var(--warn)'}">{fmtIQD(profit)}</span>
      {/key}
      <span class="muted small">({margin}%) ربح القطعة</span>
    </Glass>
  {/if}

  <div class="field">
    <label>المقاسات والكميات * {selColors.length > 1 ? '— لكل لون شبكة مقاساته' : ''}</label>
    {#if selColors.length}
      <div class="stack" style="gap:12px">
        {#each selColors as c (c)}
          <div class="color-block" class:bad={isMissing('مقاس واحد بكمية على الأقل') && totalPieces === 0}>
            <div class="cb-head">
              <i class="cb-dot" style="background:{c === NOCOLOR ? 'transparent' : hexForColor(c, palette)}"></i>
              <span class="bold">{c}</span>
              <span class="cb-count" class:has={colorPieces(c) > 0}>{colorPieces(c) > 0 ? `${colorPieces(c)} قطعة` : 'حدّدي الكميات'}</span>
            </div>
            <SizeQtyGrid sizes={baseSizes} bind:value={byColor[c]} />
          </div>
        {/each}
      </div>
    {:else}
      <div class="cb-empty">اختاري لوناً من الدوائر أولاً — ثم تحدّدين مقاسات كل لون وكمياته</div>
    {/if}
  </div>

  <div class="field">
    <label>ملاحظات <span class="muted tiny">(اختياري)</span></label>
    <textarea class="input" bind:value={notes} rows="2" placeholder="اختياري…"></textarea>
  </div>

  {#if tried && missing.length}
    <div class="miss pop">مطلوب قبل الحفظ: {missing.join(' • ')}</div>
  {/if}

  {#if editing}
    <button class="btn danger block" onclick={zeroAllQty}>
      <Icon name="x" size={18} />
      تصفير كل الكميات — الموديل نفد
    </button>
  {/if}

  <button class="btn primary lg block" onclick={save}>
    <Icon name="check" size={20} />
    {editing ? 'حفظ التعديلات' : totalPieces > 0 ? `حفظ ${totalPieces} قطعة (${selColors.length} لون • ${totalSizes} مقاس)` : 'إضافة الموديل'}
  </button>
</div>

<style>
  :global(.nm-row) { align-items: flex-end; }
  .photo-wrap { position: relative; display: inline-flex; }
  .photo-tile {
    width: 86px; height: 86px;
    border-radius: var(--r-md);
    border: 1.5px dashed var(--line-2);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.06));
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .photo-tile:active { transform: scale(0.95); }
  .photo-tile.has { border-style: solid; border-color: rgba(181, 73, 91, 0.45); }
  .photo-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ph-txt { font-size: 10.5px; font-weight: 800; color: var(--taupe); }
  .re-take {
    position: absolute; bottom: 4px; inset-inline-start: 4px;
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 9.5px; font-weight: 800; color: #fff;
    background: rgba(58, 26, 32, 0.55);
    backdrop-filter: blur(8px);
    border-radius: 999px; padding: 3px 7px;
  }
  .ph-x-wrap { position: absolute; top: -7px; left: -7px; }
  .ph-x {
    width: 26px; height: 26px;
    border-radius: 50%;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.85);
    color: var(--burgundy);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .sp-nocolor {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; font-weight: 800; color: var(--burgundy-deep);
    background: var(--accent-soft);
    border-radius: 999px; padding: 4px 10px;
  }
  .sp-nocolor button { background: none; border: none; color: var(--burgundy); cursor: pointer; padding: 0; display: inline-flex; }
  .err-line { font-size: 11px; color: var(--burgundy); font-weight: 700; }
  .color-block {
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.28);
  }
  .color-block.bad { border-color: rgba(181, 73, 91, 0.5); }
  .cb-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .cb-dot { width: 15px; height: 15px; border-radius: 50%; border: 1.5px solid var(--line-2); flex: none; }
  .cb-count {
    margin-inline-start: auto;
    font-size: 10.5px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.07);
    border-radius: 999px; padding: 3px 9px;
  }
  .cb-count.has { color: var(--good); background: rgba(78, 138, 95, 0.12); }
  .cb-empty {
    font-size: 12.5px; font-weight: 700; color: var(--taupe);
    border: 1.5px dashed var(--line-2);
    border-radius: var(--r-md);
    padding: 14px; text-align: center;
  }
  .miss {
    font-size: 12px; font-weight: 800; color: var(--burgundy-deep);
    background: var(--accent-soft);
    border: 1px solid rgba(181, 73, 91, 0.25);
    border-radius: 12px; padding: 9px 12px;
  }
  :global(.profit) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: var(--r-md);
  }
  .pnum { font-weight: 800; font-variant-numeric: tabular-nums; }
  :global(.stepper) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px;
    border-radius: var(--r-md);
  }
</style>
