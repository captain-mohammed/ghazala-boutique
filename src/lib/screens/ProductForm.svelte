<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import { db, addProduct, updateProduct, modelOptions, SIZE_RUNS, modelKey } from '../db.js';
  import { fmtIQD, buzz, iqd, fileToPhotoDataUrl } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let { product = null, photo = null, ondone = () => {} } = $props();

  const editing = !!product;

  let name = $state(product?.name ?? '');
  let category = $state(product?.category ?? '');
  let type = $state(product?.type ?? '');
  let brand = $state(product?.brand ?? '');
  let color = $state(product?.color ?? '');
  let season = $state(product?.season ?? '');
  let material = $state(product?.material ?? '');
  let size = $state(product?.size ?? '');
  let cost = $state(product?.cost ?? '');
  let price = $state(product?.price ?? '');
  let qty = $state(product?.qty ?? 1);
  let notes = $state(product?.notes ?? '');

  /* owner vocabulary — المزيد ← خيارات الموديلات */
  let opts = $state({ categories: [], types: [], seasons: [], materials: [], colors: [] });
  (async () => { opts = await modelOptions(); if (!category) category = opts.categories[0] || 'نسائية'; })();

  /* photo-first: the picture rides the whole form, sitting beside the name */
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

  let multi = $state(!product);
  let sizeQtys = $state({});
  const baseSizes = $derived(SIZE_RUNS[category] || SIZE_RUNS['نسائية']);

  const profit = $derived(Math.max(0, iqd(price) - iqd(cost)));
  const margin = $derived(iqd(price) > 0 ? Math.round((profit / iqd(price)) * 100) : 0);
  const multiTotal = $derived(Object.values(sizeQtys).reduce((a, n) => a + (Number(n) || 0), 0));
  const multiSizes = $derived(Object.keys(sizeQtys).filter((s) => sizeQtys[s] > 0));
  const hasSizes = $derived(multi ? multiSizes.length > 0 : qty > 0 && String(size).trim().length > 0);

  /* everything is required except الملاحظات (add mode only) */
  const missing = $derived.by(() => {
    if (editing) return name.trim() ? [] : ['اسم الموديل'];
    const m = [];
    if (!img) m.push('الصورة');
    if (!name.trim()) m.push('اسم الموديل');
    if (!category) m.push('التصنيف');
    if (!type) m.push('النوع');
    if (!season) m.push('الموسم');
    if (!color) m.push('اللون');
    if (!material) m.push('المادة');
    if (iqd(cost) <= 0) m.push('التكلفة');
    if (iqd(price) <= 0) m.push('سعر البيع');
    if (!hasSizes) m.push('المقاسات');
    return m;
  });
  const valid = $derived(missing.length === 0);
  let tried = $state(false);

  const isMissing = (label) => tried && missing.includes(label);
  const bad = (label) => (isMissing(label) ? { 'border-color': 'rgba(181,73,91,0.6)', 'box-shadow': '0 0 0 3px rgba(181,73,91,0.1)' } : {});

  function payload(sizeKey, q) {
    return {
      name: name.trim(), category, type, brand: brand.trim(), color: color.trim(),
      season, material, size: String(sizeKey).trim(),
      cost: iqd(cost), price: iqd(price),
      qty: Math.max(0, Math.round(Number(q) || 0)), notes: notes.trim(), photo: img
    };
  }

  async function saveMulti() {
    try {
      const all = await db.products.toArray();
      const idx = new Map(all.map((p) => [modelKey(p), p]));
      let created = 0, merged = 0;
      const names = [];
      for (const s of multiSizes) {
        const data = payload(s, sizeQtys[s]);
        const twin = idx.get(modelKey(data));
        if (twin) {
          await updateProduct(twin.sku, { qty: (twin.qty || 0) + data.qty, cost: data.cost, price: data.price, type: data.type, season: data.season, material: data.material, photo: twin.photo || data.photo });
          merged++;
        } else {
          const p = await addProduct(data);
          idx.set(modelKey(p), p);
          created++; names.push(s);
        }
      }
      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
      const parts = [];
      if (created) parts.push(`${created} بطاقة (${names.sort((a, b) => parseFloat(a) - parseFloat(b)).join('، ')})`);
      if (merged) parts.push(`${merged} اندمجت مع الموجود`);
      toastOk(`تم الحفظ — ${multiTotal} قطعة • ${parts.join(' • ')}`);
      ondone();
    } catch (e) {
      toastErr('حدث خطأ أثناء الحفظ');
      console.error(e);
    }
  }

  async function save() {
    if (!valid) {
      tried = true;
      buzz([30, 40, 30]);
      toastErr(`مطلوب: ${missing.slice(0, 3).join('، ')}${missing.length > 3 ? '…' : ''}`);
      return;
    }
    if (editing) {
      try {
        await updateProduct(product.sku, payload(product.size, qty));
        toastOk('تم حفظ التعديلات');
        ondone();
      } catch (e) {
        toastErr('حدث خطأ أثناء الحفظ');
        console.error(e);
      }
      return;
    }
    if (multi) { saveMulti(); return; }
    try {
      const data = payload(size, qty);
      /* Same-kind detection: identical name + category + size + color means
         it's more stock of a model we already have — offer to merge. */
      const all = await db.products.toArray();
      const twin = all.find((p) => p.name.trim().toLowerCase() === data.name.toLowerCase() && p.category === data.category && String(p.size || '').trim() === data.size && (p.color || '').trim() === data.color);
      if (twin) {
        const merge = await askConfirm({
          title: 'موديل مطابق موجود',
          body: `«${twin.name}» مقاس ${twin.size || '—'} موجود بالكود ${twin.sku} وكميته ${twin.qty}.\n«دمج» يزيد كميته بـ ${data.qty} ويحدّث السعر — «إلغاء» يضيفه كموديل منفصل.`,
          okLabel: 'دمج'
        });
        if (merge) {
          await updateProduct(twin.sku, { qty: twin.qty + data.qty, cost: data.cost, price: data.price, type: data.type || twin.type, season: data.season || twin.season, material: data.material || twin.material, photo: twin.photo || data.photo });
          toastOk(`اندُمجت الكمية — ${twin.sku} أصبح ${twin.qty + data.qty} قطعة`);
          buzz([20, 50, 20]);
          celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
          ondone();
          return;
        }
      }
      const p = await addProduct(data);
      toastOk(`تمت الإضافة — كود: ${p.sku}`);
      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
      ondone();
    } catch (e) {
      toastErr('حدث خطأ أثناء الحفظ');
      console.error(e);
    }
  }
</script>

<div class="stack" style="gap:14px">
  <!-- photo beside the name (right side in RTL) -->
  <div class="row nm-row" style="gap:12px; align-items:flex-end">
    <div class="field" style="flex:1">
      <label>اسم الموديل *</label>
      <input class="input" style={bad('اسم الموديل')} bind:value={name} placeholder="مثال: بوت جلد أسود" />
    </div>
    <div class="field" style="flex:none">
      <label>صورة الموديل *</label>
      <div class="photo-wrap">
        <button type="button" class="photo-tile" class:has={!!img} class:bad={isMissing('الصورة')} onclick={() => camInput?.click()}>
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
        <button type="button" class="chip" class:on={category === c} onclick={() => { category = c; }}>{c}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label>النوع *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.types as t (t)}
        <button type="button" class="chip gold-on" class:on={type === t} onclick={() => (type = type === t ? '' : t)}>{t}</button>
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

  <ColorSwatches bind:value={color} colors={opts.colors} label="اللون *" hint="اختاري لون المنتج بدقّة" />

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

  {#if editing}
    <div class="row" style="gap:10px">
      <div class="field" style="flex:1">
        <label>المقاس</label>
        <input class="input" bind:value={size} placeholder="37" inputmode="numeric" />
      </div>
      <div class="field" style="flex:1">
        <label>الكمية</label>
        <Glass class="stepper" radius="var(--r-md)">
          <button class="step" onclick={() => { if (qty > 0) { qty--; buzz(6); } }} aria-label="نقصان">−</button>
          <div class="qty-num">{qty}</div>
          <button class="step" onclick={() => { qty++; buzz(6); }} aria-label="زيادة">+</button>
        </Glass>
      </div>
    </div>
  {:else}
    <div class="field" style={isMissing('المقاسات') ? 'background: rgba(181,73,91,0.04); border-radius:16px; padding:10px' : ''}>
      <div class="mode-row">
        <label>المقاسات والكميات *</label>
        <div class="seg">
          <button type="button" class="sg" class:on={!multi} onclick={() => (multi = false)}>مقاس واحد</button>
          <button type="button" class="sg" class:on={multi} onclick={() => (multi = true)}>عدة مقاسات</button>
        </div>
      </div>
      {#if multi}
        <SizeQtyGrid sizes={baseSizes} bind:value={sizeQtys} />
      {:else}
        <div class="row" style="gap:10px">
          <div class="field" style="flex:1">
            <label>المقاس</label>
            <input class="input" bind:value={size} placeholder="37" inputmode="numeric" />
          </div>
          <div class="field" style="flex:1">
            <label>الكمية</label>
            <Glass class="stepper" radius="var(--r-md)">
              <button class="step" onclick={() => { if (qty > 0) { qty--; buzz(6); } }} aria-label="نقصان">−</button>
              <div class="qty-num">{qty}</div>
              <button class="step" onclick={() => { qty++; buzz(6); }} aria-label="زيادة">+</button>
            </Glass>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="field">
    <label>ملاحظات <span class="muted tiny">(اختياري — الوحيد)</span></label>
    <textarea class="input" bind:value={notes} rows="2" placeholder="اختياري…"></textarea>
  </div>

  {#if tried && missing.length}
    <div class="miss pop">مطلوب قبل الحفظ: {missing.join(' • ')}</div>
  {/if}

  <button class="btn primary lg block" onclick={save}>
    <Icon name="check" size={20} />
    {editing ? 'حفظ التعديلات' : multi && multiSizes.length ? `حفظ ${multiTotal} قطعة (${multiSizes.length} مقاس)` : 'إضافة الموديل'}
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
  .photo-tile.bad { border-color: rgba(181, 73, 91, 0.7); }
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
  .mode-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .mode-row label { margin: 0; }
  .seg {
    display: inline-flex;
    border: 1px solid var(--line-2);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.5);
    padding: 3px;
    gap: 3px;
  }
  .sg {
    border: none; background: none; cursor: pointer;
    font-family: inherit; font-size: 12px; font-weight: 800;
    color: var(--taupe);
    padding: 6px 12px; border-radius: 9px;
    transition: background 0.2s, color 0.2s;
  }
  .sg.on { background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep)); color: #fff; }
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
  .step {
    width: 48px; height: 48px;
    border-radius: 14px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.6);
    font-size: 24px;
    font-weight: 800;
    color: var(--burgundy);
    cursor: pointer;
    transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .step:active { transform: scale(0.86); }
  .qty-num {
    font-size: 24px;
    font-weight: 800;
    color: var(--ink);
    min-width: 60px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
