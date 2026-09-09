<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import { db, addProduct, updateProduct, WOMENS_TYPES, DEFAULT_CATEGORIES, SIZE_RUNS, modelKey } from '../db.js';
  import { fmtIQD, buzz, fileToPhotoDataUrl } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let { product = null, photo = null, ondone = () => {} } = $props();

  let name = $state(product?.name ?? '');
  let category = $state(product?.category ?? 'نسائية');
  let type = $state(product?.type ?? '');
  let brand = $state(product?.brand ?? '');
  let color = $state(product?.color ?? '');
  let size = $state(product?.size ?? '');
  let cost = $state(product?.cost ?? '');
  let price = $state(product?.price ?? '');
  let qty = $state(product?.qty ?? 1);
  let notes = $state(product?.notes ?? '');

  /* photo-first: the picture rides through the whole form (and into every size card) */
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

  const cats = [...DEFAULT_CATEGORIES];

  const profit = $derived(Math.max(0, (Number(price) || 0) - (Number(cost) || 0)));
  const margin = $derived(Number(price) > 0 ? Math.round((profit / Number(price)) * 100) : 0);
  const multiTotal = $derived(Object.values(sizeQtys).reduce((a, n) => a + (Number(n) || 0), 0));
  const multiSizes = $derived(Object.keys(sizeQtys).filter((s) => sizeQtys[s] > 0));
  const valid = $derived(
    name.trim().length > 0 && (product || !multi ? true : multiSizes.length > 0)
  );

  async function saveMulti() {
    try {
      const all = await db.products.toArray();
      const idx = new Map(all.map((p) => [modelKey(p), p]));
      const shared = {
        name: name.trim(), category, type,
        color: color.trim(),
        cost: Number(cost) || 0, price: Number(price) || 0,
        photo: img, notes: notes.trim()
      };
      let created = 0, merged = 0;
      const names = [];
      for (const s of multiSizes) {
        const q = Math.max(0, Math.round(Number(sizeQtys[s]) || 0));
        const twin = idx.get(modelKey({ ...shared, size: s }));
        if (twin) {
          await updateProduct(twin.sku, { ...shared, size: s, qty: (twin.qty || 0) + q });
          merged++;
        } else {
          const p = await addProduct({ ...shared, size: s, qty: q });
          idx.set(modelKey(p), p);
          created++; names.push(s);
        }
      }
      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
      const parts = [];
      if (created) parts.push(`${created} بطاقة (${names.sort().join('، ')})`);
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
      if (!name.trim()) toastErr('اكتب اسم الموديل');
      else if (multi) toastErr('حدّد مقاساً واحداً على الأقل');
      return;
    }
    if (product) {
      try {
        await updateProduct(product.sku, {
          name: name.trim(), category, type, brand: brand.trim(), color: color.trim(),
          size: String(size).trim(), cost: Number(cost) || 0, price: Number(price) || 0,
          qty: Math.max(0, Math.round(Number(qty) || 0)), notes: notes.trim(), photo: img
        });
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
      const data = {
        name: name.trim(), category, type, brand: brand.trim(), color: color.trim(),
        size: String(size).trim(), cost: Number(cost) || 0, price: Number(price) || 0,
        qty: Math.max(0, Math.round(Number(qty) || 0)), notes: notes.trim(), photo: img
      };
      /* Same-kind detection: identical name + category + size + color means
         it's more stock of a model we already have — offer to merge into
         the existing SKU instead of creating a duplicate card. */
      const all = await db.products.toArray();
      const twin = all.find((p) =>
        p.name.trim().toLowerCase() === data.name.toLowerCase() &&
        p.category === data.category &&
        String(p.size || '').trim() === data.size &&
        (p.color || '').trim() === data.color
      );
      if (twin) {
        const merge = await askConfirm({
          title: 'موديل مطابق موجود',
          body: `«${twin.name}» مقاس ${twin.size || '—'} موجود بالكود ${twin.sku} وكميته ${twin.qty}.\n«دمج» يزيد كميته بـ ${data.qty} ويحدّث السعر — «إلغاء» يضيفه كموديل منفصل.`,
          okLabel: 'دمج'
        });
        if (merge) {
          await updateProduct(twin.sku, { qty: twin.qty + data.qty, cost: data.cost, price: data.price, photo: twin.photo || data.photo });
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
  <!-- Photo-first tile -->
  <div class="field">
    <label>صورة الموديل {#if img}<span class="muted tiny">— تركب مع كل المقاسات</span>{/if}</label>
    <div class="photo-row">
      <button type="button" class="photo-tile" class:has={!!img} onclick={() => camInput?.click()}>
        {#if img}
          <img src={img} alt="preview" />
          <span class="re-take"><Icon name="image" size={13} /> إعادة</span>
        {:else}
          <Icon name="image" size={26} color="var(--taupe)" />
          <span class="ph-txt">صوّري الحذاء أولاً</span>
        {/if}
      </button>
      {#if img}
        <button type="button" class="ph-x" aria-label="إزالة الصورة" onclick={() => { img = null; buzz(6); }}>
          <Icon name="x" size={14} />
        </button>
      {/if}
      <input type="file" accept="image/*" capture="environment" style="display:none" bind:this={camInput} onchange={onPhoto} />
    </div>
  </div>

  <div class="field">
    <label>اسم الموديل *</label>
    <input class="input" bind:value={name} placeholder="مثال: بوت جلد أسود" />
  </div>

  <div class="field">
    <label>التصنيف</label>
    <div class="row wrap" style="gap:8px">
      {#each cats as c (c)}
        <button type="button" class="chip" class:on={category === c} onclick={() => { category = c; type = ''; }}>{c}</button>
      {/each}
    </div>
  </div>

  {#if category === 'نسائية'}
    <div class="field">
      <label>النوع</label>
      <div class="row wrap" style="gap:8px">
        {#each WOMENS_TYPES as t (t)}
          <button type="button" class="chip gold-on" class:on={type === t} onclick={() => (type = type === t ? '' : t)}>{t}</button>
        {/each}
      </div>
    </div>
  {/if}

  <ColorSwatches bind:value={color} />

  <div class="row" style="gap:10px">
    <div class="field" style="flex:1">
      <label>سعر التكلفة (د.ع)</label>
      <input class="input" bind:value={cost} inputmode="numeric" placeholder="0" />
    </div>
    <div class="field" style="flex:1">
      <label>سعر البيع (د.ع)</label>
      <input class="input" bind:value={price} inputmode="numeric" placeholder="0" />
    </div>
  </div>

  {#if Number(price) > 0 && Number(cost) > 0}
    <Glass class="profit pop" radius="var(--r-md)">
      {#key profit}
        <span class="pnum" style="color:{margin >= 30 ? 'var(--good)' : 'var(--warn)'}">{fmtIQD(profit)}</span>
      {/key}
      <span class="muted small">({margin}%) ربح القطعة</span>
    </Glass>
  {/if}

  {#if product}
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
    <div class="field">
      <div class="mode-row">
        <label>المقاسات والكميات</label>
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
    <label>ملاحظات</label>
    <textarea class="input" bind:value={notes} rows="2" placeholder="اختياري…"></textarea>
  </div>

  <button class="btn primary lg block" onclick={save} disabled={!valid}>
    <Icon name="check" size={20} />
    {product ? 'حفظ التعديلات' : multi ? `حفظ ${multiTotal || ''} قطعة (${multiSizes.length} مقاس)` : 'إضافة الموديل'}
  </button>
</div>

<style>
  .photo-row { position: relative; display: inline-flex; }
  .photo-tile {
    width: 108px; height: 108px;
    border-radius: var(--r-md);
    border: 1.5px dashed var(--line-2);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.6), rgba(181, 73, 91, 0.06));
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    cursor: pointer;
    overflow: hidden;
    position: relative;
    transition: border-color 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .photo-tile:active { transform: scale(0.96); }
  .photo-tile.has { border-style: solid; border-color: rgba(181, 73, 91, 0.4); }
  .photo-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .ph-txt { font-size: 11px; font-weight: 800; color: var(--taupe); padding: 0 6px; text-align: center; }
  .re-take {
    position: absolute; bottom: 6px; inset-inline-start: 6px;
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10.5px; font-weight: 800; color: #fff;
    background: rgba(58, 26, 32, 0.55);
    backdrop-filter: blur(8px);
    border-radius: 999px; padding: 4px 8px;
  }
  .ph-x {
    width: 34px; height: 34px;
    border-radius: 50%;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.7);
    color: var(--burgundy);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    align-self: flex-start;
    margin-inline-start: 8px;
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
