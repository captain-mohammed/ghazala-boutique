<script>
  import Icon from '../components/Icon.svelte';
  import { db, addProduct, updateProduct, WOMENS_TYPES, DEFAULT_CATEGORIES } from '../db.js';
  import { fmtIQD, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let { product = null, ondone = () => {} } = $props();

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

  const cats = [...DEFAULT_CATEGORIES];

  const profit = $derived(Math.max(0, (Number(price) || 0) - (Number(cost) || 0)));
  const margin = $derived(Number(price) > 0 ? Math.round((profit / Number(price)) * 100) : 0);
  const valid = $derived(name.trim().length > 0);

  async function save() {
    if (!valid) { toastErr('اكتب اسم الموديل'); return; }
    try {
      const data = {
        name: name.trim(), category, type, brand: brand.trim(), color: color.trim(),
        size: String(size).trim(), cost: Number(cost) || 0, price: Number(price) || 0,
        qty: Math.max(0, Math.round(Number(qty) || 0)), notes: notes.trim()
      };
      if (product) {
        await updateProduct(product.sku, data);
        toastOk('تم حفظ التعديلات');
      } else {
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
            await updateProduct(twin.sku, { qty: twin.qty + data.qty, cost: data.cost, price: data.price });
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
      }
      ondone();
    } catch (e) {
      toastErr('حدث خطأ أثناء الحفظ');
      console.error(e);
    }
  }
</script>

<div class="stack" style="gap:14px">
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

  <div class="row" style="gap:10px">
    <div class="field" style="flex:1">
      <label>اللون</label>
      <input class="input" bind:value={color} placeholder="أسود" />
    </div>
    <div class="field" style="flex:1">
      <label>المقاس</label>
      <input class="input" bind:value={size} placeholder="37" inputmode="numeric" />
    </div>
  </div>

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
    <div class="profit glass pop">
      {#key profit}
        <span class="pnum" style="color:{margin >= 30 ? 'var(--good)' : 'var(--warn)'}">{fmtIQD(profit)}</span>
      {/key}
      <span class="muted small">({margin}%) ربح القطعة</span>
    </div>
  {/if}

  <div class="field">
    <label>الكمية</label>
    <div class="stepper glass">
      <button class="step" onclick={() => { if (qty > 0) { qty--; buzz(6); } }} aria-label="نقصان">−</button>
      <div class="qty-num">{qty}</div>
      <button class="step" onclick={() => { qty++; buzz(6); }} aria-label="زيادة">+</button>
    </div>
  </div>

  <div class="field">
    <label>ملاحظات</label>
    <textarea class="input" bind:value={notes} rows="2" placeholder="اختياري…"></textarea>
  </div>

  <button class="btn primary lg block" onclick={save} disabled={!valid}>
    <Icon name="check" size={20} />
    {product ? 'حفظ التعديلات' : 'إضافة الموديل'}
  </button>
</div>

<style>
  .profit {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: var(--r-md);
  }
  .pnum { font-weight: 800; font-variant-numeric: tabular-nums; }
  .stepper {
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
