<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import Pick from '../components/Pick.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import PhotoSourceSheet from '../components/PhotoSourceSheet.svelte';
  import { slide } from 'svelte/transition';
  import { receiveBatch, nextModelId, modelOptions, SIZE_RUNS, subsOfType, subsOfType2, subsOfType3, getSetting, setSetting, db, waitingForModel, typeChain } from '../db.js';
  import { fmtNum, fmtIQD, buzz, iqd, fileToPhotoDataUrl } from '../utils.js';
  import { reducedMotion } from '../motion.js';
  import { get } from 'svelte/store';
  import { toastOk, toastErr, toast, celebrateAt, invoicePreset, campaignContacts } from '../store.js';

  let { goto } = $props();

  let opts = $state({ categories: ['نسائية'], types: [], seasons: [], materials: [], colors: [] });
  (async () => { opts = await modelOptions(); })();

  let uid = 0;
  const blank = (over = {}) => ({
    id: ++uid, name: '', category: 'نسائية', type: '', season: '', material: '', color: '',
    cost: '', price: '', sizes: {}, photo: null,
    ...over
  });
  /* الاسم صار داخلياً فقط (يُشتق من النوع واللون) — الهوية هي الصورة */
  const lineAutoName = (l) => [l.type, l.color].filter(Boolean).join(' ') || l.category || 'موديل';

  let supplier = $state('');
  let suppliers = $state([]);
  let invoice = $state('');
  let note = $state('');
  /* سطر واحد مفتوح في الوقت الواحد (أكورديون): إضافة سطر جديد تطوي السابق
     تلقائياً، فتبقى الفاتورة قصيرة ومقروءة مهما كثُرت الموديلات — وكل سطر
     مطويّ يظلّ معرَّفاً بصورته ولونه ومقاساته وكميته. */
  const seedLine = blank();
  let lines = $state([seedLine]);
  let openId = $state(seedLine.id);
  let saving = $state(false);
  /* عائلة «لون آخر لنفس الموديل»: كل الأسطر المنسوخة من بعضها تحمل family
     واحداً — يُحوَّل لرقم موديل واحد (M-…) عند الحفظ، فتتجمّع ألوان الفاتورة
     على بطاقة واحدة بدل أن تنشأ كموديلات منفصلة */
  let familySeq = 0;

  /* سجل الموردين من الإعدادات — والاسم الجديد يُحفظ فيه تلقائياً عند الحفظ.
     أول مورد مُختار سلفاً — لا تُترك القائمة فارغة */
  (async () => {
    suppliers = (await getSetting('suppliers', [])) || [];
    if (!supplier && suppliers.length) supplier = suppliers[0];
  })();

  /* a restock suggestion / size-run hole may arrive pre-filled */
  $effect(() => {
    const pre = get(invoicePreset);
    if (!pre) return;
    if (pre.supplier) supplier = pre.supplier;
    if (Array.isArray(pre.lines) && pre.lines.length) {
      const next = pre.lines.map((l) => blank(l));
      lines = next;
      openId = next[0].id;
    }
    invoicePreset.set(null);
  });

  const totalPieces = $derived(lines.reduce((a, l) => a + Object.values(l.sizes).reduce((x, n) => x + (Number(n) || 0), 0), 0));
  const linePieces = (l) => Object.values(l.sizes).reduce((x, n) => x + (Number(n) || 0), 0);
  const filledLines = $derived(lines.filter((l) => linePieces(l) > 0).length);
  const canSave = $derived(supplier.trim().length >= 2 && lines.some((l) => linePieces(l) > 0));

  /* ---- ملخّص السطر المطويّ: يكفي للتعرّف عليه بلا فتحه ---- */
  const isOpen = (l) => openId === l.id;
  const lineTitle = (l) => [typeChain(l), l.color].filter(Boolean).join(' · ');
  const sizesSummary = (l) =>
    Object.entries(l.sizes)
      .filter(([, n]) => Number(n) > 0)
      .map(([s, n]) => `${s}×${fmtNum(n)}`)
      .join('  ');
  const moneySummary = (l) => {
    const bits = [];
    if (iqd(l.cost) > 0) bits.push(`تكلفة ${fmtIQD(iqd(l.cost))}`);
    if (iqd(l.price) > 0) bits.push(`بيع ${fmtIQD(iqd(l.price))}`);
    return bits.join(' · ');
  };
  const missingPhoto = (l) => linePieces(l) > 0 && !l.photo;
  const blankish = (l) => !lineTitle(l) && linePieces(l) === 0;

  function toggleOpen(l) {
    openId = openId === l.id ? null : l.id;
    buzz(6);
  }
  const allFolded = $derived(openId === null);
  function foldAll() {
    openId = null;
    buzz(6);
  }

  function addLine() {
    const last = lines[lines.length - 1];
    const nl = blank(last ? { category: last.category, type: last.type, season: last.season, material: last.material, color: last.color, cost: last.cost, price: last.price } : {});
    lines = [...lines, nl];
    openId = nl.id; /* السطر الجديد يُفتح والسابق يُطوى */
    buzz(8);
  }
  /* لون آخر لنفس الموديل — يشارك نفس الرقم الداخلي والصورة والأسعار */
  function addSameModelLine() {
    const last = lines[lines.length - 1];
    if (!last) { addLine(); return; }
    const shared =
      (typeof last.modelId === 'string' && last.modelId.startsWith('M-')) ? last.modelId
      : last.family ? last.family
      : (familySeq += 1, 'F' + familySeq); /* عائلة جديدة — الأسطر تُرقَّم معاً عند الحفظ */
    if (shared.startsWith('F')) last.family = shared;
    const nl = blank({
      category: last.category, type: last.type, typeSub: last.typeSub || '', typeSub2: last.typeSub2 || '', typeSub3: last.typeSub3 || '', season: last.season, material: last.material,
      color: '', cost: last.cost, price: last.price, photo: last.photo,
      modelId: shared.startsWith('M-') ? shared : undefined,
      family: shared.startsWith('F') ? shared : null
    });
    lines = [...lines, nl];
    openId = nl.id; /* السطر الجديد يُفتح والسابق يُطوى */
    buzz(8);
  }
  function removeLine(id) {
    if (lines.length <= 1) return;
    const idx = lines.findIndex((l) => l.id === id);
    const next = lines.filter((l) => l.id !== id);
    lines = next;
    /* لا نترك الصفحة بلا سطر مفتوح: نفتح الذي قبله */
    if (openId === id) openId = (next[Math.max(0, idx - 1)] || next[0])?.id ?? null;
    buzz(6);
  }

  async function onLinePhoto(l, e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { l.photo = await fileToPhotoDataUrl(f, 640); buzz(10); }
    catch { toastErr('تعذّرت قراءة الصورة'); }
  }

  /* مصدر صورة السطر: كاميرا أو معرض. الحقول مشتركة بين الأسطر، والسطر
     المستهدف يُحفظ في photoLine قبل فتح المحدِّد. */
  let photoLine = $state(null);
  let photoSrcOpen = $state(false);
  let camInput;
  let galInput;
  function askPhotoSource(l) {
    photoLine = l;
    photoSrcOpen = true;
    buzz(8);
  }
  function pickPhotoSource(src) {
    photoSrcOpen = false;
    setTimeout(() => (src === 'gallery' ? galInput : camInput)?.click(), 180);
  }

  async function save() {
    if (saving) return;
    if (!supplier.trim()) { toastErr('اختاري المورد من القائمة — وضيفي الجدد من الإعدادات'); return; }
    if (!suppliers.includes(supplier.trim())) {
      suppliers = [...suppliers, supplier.trim()];
      await setSetting('suppliers', [...suppliers]);
    }
    const good = lines.filter((l) => linePieces(l) > 0);
    if (!good.length) { toastErr('سطر واحد على الأقل: مقاس بكمية'); return; }
    saving = true;
    try {
      /* كل الأسطر التي تحمل نفس modelId أو نفس family = موديل واحد */
      const familyIds = new Map();
      for (const l of good) {
        if (typeof l.modelId === 'string' && l.modelId.startsWith('M-')) continue;
        if (l.family && !familyIds.has(l.family)) familyIds.set(l.family, await nextModelId());
      }
      const r = await receiveBatch({
        supplier, invoice, note,
        lines: good.map((l) => ({
          name: lineAutoName(l), category: l.category, type: l.type, typeSub: l.typeSub || '', typeSub2: l.typeSub2 || '', typeSub3: l.typeSub3 || '', season: l.season, material: l.material, color: l.color,
          cost: iqd(l.cost), price: iqd(l.price),
          sizes: l.sizes, photo: l.photo,
          modelId: (typeof l.modelId === 'string' && l.modelId.startsWith('M-')) ? l.modelId : familyIds.get(l.family)
        }))
      });
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.6, '📦');
      toastOk(`تم الاستلام — ${fmtNum(r.pieces)} قطعة (${fmtNum(r.added)} بطاقة جديدة${r.merged ? `، ${fmtNum(r.merged)} اندمجت` : ''})`);
      /* سطر غامض: أكثر من موديل بنفس النوع واللون — لم نخمّن أبداً، ونسجّله
         منفصلاً ونُبلّغ.
         ⚠️ الصياغة القديمة كانت تقول «عندك ٢٥ موديلات باسم «بوت أسود» —
         راجعيهم من «إصلاح الموديلات»»، فتُفهَم خطأً كأنها ٢٥ نسخة مكرّرة،
         وتوجّه صاحبة البوتيك إلى صفحة الدمج. والحقيقة أن الاسم المشتق
         (النوع + اللون) يتكرّر بطبيعته: كل بوت أسود اسمه «بوت أسود»، والصور
         هي التي تفرّق بينها — والبيانات سليمة تماماً ولم يُدمج شيء.
         التنبيه الآن يقول ما جرى فعلاً وما العمل الصحيح. */
      if (r.splitOff?.length) {
        const f = r.splitOff[0];
        toast(
          `سُجّل السطر كموديل جديد — لم تُضَف كميته إلى أي موديل قديم. الاسم «${f.name}» يحمله ${fmtNum(f.existing)} موديلات (الاسم يُشتق من النوع واللون فقط، والصورة هي التي تفرّق بينها)، فلا نعرف أيّها تقصدين. لتزويد موديل موجود، افتحي الموديل من المخزون واضغطي «تعديل».`,
          'default',
          9000
        );
      }
      /* التوريد = أقوى لحظة تسويق. الأولوية لقائمة الانتظار (بيع مضمون)،
         وإلا ف«قبل الجميع» لكبار الزبونات. */
      try {
        const { firstdibsCampaign } = await import('../db.js');
        /* ١) منتظرات وصلن قطعها؟ */
        const matched = [];
        for (const sku of r.touchedSkus || []) {
          const p = await db.products.get(sku);
          if (!p) continue;
          for (const w of await waitingForModel({ modelId: p.modelId || '', sku, size: p.size || '', color: p.color || '' })) {
            if (!matched.some((x) => x.key === w.key)) matched.push(w);
          }
        }
        if (matched.length) {
          const first = await db.products.get(r.touchedSkus[0]);
          campaignContacts.set({
            kind: 'waiting',
            model: first ? { modelId: first.modelId, chain: [first.type, first.typeSub, first.typeSub2, first.typeSub3].filter(Boolean).join(' - ') || '—', colors: first.color || '—', sizes: String(first.size || ''), price: first.price } : null,
            contacts: matched.map((w) => ({ name: w.customerName, phone: w.customerPhone }))
          });
          setTimeout(() => goto('broadcast'), 450);
          return;
        }
        /* ٢) «قبل الجميع» */
        const first = await db.products.get(r.touchedSkus?.[0]);
        if (first) {
          const chain = [first.type, first.typeSub, first.typeSub2, first.typeSub3].filter(Boolean).join(' - ') || first.category || 'موديل جديد';
          const campaign = await firstdibsCampaign({ modelId: first.modelId, chain, colors: first.color || '—', sizes: '—', price: first.price || 0 });
          if (campaign.contacts.length) {
            campaignContacts.set(campaign);
            setTimeout(() => goto('broadcast'), 450);
            return;
          }
        }
      } catch { /* لا تعطل الاستلام أبداً */ }
      setTimeout(() => goto('inventory'), 500);
    } catch (e) {
      console.error(e);
      toastErr('تعذر حفظ الفاتورة');
    } finally {
      saving = false;
    }
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="head-card rise">
    <span class="h-ic"><Icon name="upload" size={20} color="#fff" /></span>
    <div style="flex:1; min-width:0">
      <div class="bold">فاتورة وارد</div>
      <div class="muted small">استلمي البضاعة كلها بصفحة واحدة — والمورد يُسجَّل للأبد</div>
    </div>
    {#if totalPieces > 0}
      <span class="head-count"><b>{fmtNum(totalPieces)}</b> قطعة</span>
    {/if}
  </Glass>

  <div class="row" style="gap:10px">
    <div class="field" style="flex:1.6">
      <label>المورد / منين شريتِ؟ <span class="req">*</span></label>
      {#if suppliers.length}
        <Pick bind:value={supplier} placeholder="اختاري المورد…" options={suppliers} />
      {:else}
        <input class="input" bind:value={supplier} placeholder="مثال: هاي مول — أبو علي" />
        <p class="muted tiny" style="margin:4px 2px 0">سجّلي مورديك من الإعدادات لتظهروا قائمة هنا.</p>
      {/if}
    </div>
    <div class="field" style="flex:1">
      <label>رقم الفاتورة <span class="muted tiny">(اختياري)</span></label>
      <input class="input" bind:value={invoice} placeholder="123" inputmode="numeric" />
    </div>
  </div>

  <!-- إضافة الأسطر فوق القائمة: لا تحتاجين تمرير الفاتورة كلها لتصلين إليها -->
  <div class="add-row">
    <button class="btn add-line" onclick={addLine}>
      <Icon name="plus" size={17} /> سطر موديل آخر
    </button>
    <button class="btn add-line same" onclick={addSameModelLine}>
      <Icon name="copy" size={15} /> لون آخر لنفس الموديل
    </button>
  </div>

  {#if lines.length > 1}
    <div class="lines-bar">
      <span class="lb-txt">
        <b>{fmtNum(lines.length)}</b> أسطر
        {#if filledLines}<span class="lb-dim"> · {fmtNum(filledLines)} فيها كميات</span>{/if}
      </span>
      <button class="lb-btn" onclick={foldAll} disabled={allFolded}>اطوي الكل</button>
    </div>
  {/if}

  {#each lines as l, li (l.id)}
    {@const open = isOpen(l)}
    <Glass class="line rise {open ? 'is-open' : 'is-folded'}" style="animation-delay:{Math.min(li * 0.05, 0.4)}s">
      <!-- سطر مطويّ: الرأس وحده يبقى — الصورة واللون والمقاسات والكمية تكفي للتعرّف عليه -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="ln-head"
        role="button"
        tabindex="0"
        aria-expanded={open}
        onclick={() => toggleOpen(l)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(l); } }}
      >
        <span class="ln-thumb" class:has={!!l.photo}>
          {#if l.photo}<img src={l.photo} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}
        </span>

        <span class="ln-main">
          <span class="ln-n">
            سطر {fmtNum(li + 1)}{#if lineTitle(l)}<b class="ln-title"> · {lineTitle(l)}</b>{/if}
          </span>
          <span class="ln-sub">
            {#if sizesSummary(l)}{sizesSummary(l)}{:else}<i class="ln-none">لم تُدخَل مقاسات بعد</i>{/if}
          </span>
          {#if moneySummary(l)}<span class="ln-sub dim">{moneySummary(l)}</span>{/if}
        </span>

        {#if missingPhoto(l)}
          <span class="ln-warn" title="بلا صورة — الصورة هي هوية الموديل"><Icon name="alert" size={13} color="var(--warn)" /></span>
        {/if}
        <span class="ln-pieces" class:has={linePieces(l) > 0}>
          {linePieces(l) > 0 ? `${fmtNum(linePieces(l))} قطعة` : 'بلا كمية'}
        </span>
        {#if lines.length > 1}
          <button class="ln-x" aria-label="حذف السطر {fmtNum(li + 1)}" onclick={(e) => { e.stopPropagation(); removeLine(l.id); }}><Icon name="x" size={13} /></button>
        {/if}
        <span class="ln-chev" class:open aria-hidden="true"></span>
      </div>

      {#if open}
      <div class="ln-body" transition:slide={{ duration: reducedMotion() ? 0 : 180 }}>
        <div class="row" style="gap:10px; align-items:flex-start">
          <div class="field" style="flex:1">
            <label>صورة الموديل * <span class="muted tiny">— هي الهوية</span></label>
            <button type="button" class="ln-photo ln-photo-lg" class:has={!!l.photo} title="صورة الموديل" onclick={() => askPhotoSource(l)}>
              {#if l.photo}<img src={l.photo} alt="" />{:else}<Icon name="image" size={22} color="var(--taupe)" /><span class="ph-hint">صوّري</span>{/if}
            </button>
          </div>
        </div>

        <div class="field">
          <label>التصنيف</label>
          <div class="row wrap" style="gap:8px">
            {#each opts.categories as c (c)}
              <button type="button" class="chip" class:on={l.category === c} onclick={() => { l.category = c; }}>{c}</button>
            {/each}
          </div>
        </div>

        {#if opts.types.length}
          <div class="field">
            <label>النوع</label>
            <div class="row wrap" style="gap:8px">
              {#each opts.types as t (t)}
                <button type="button" class="chip" class:on={l.type === t} onclick={() => { l.type = l.type === t ? '' : t; l.typeSub = ''; l.typeSub2 = ''; }}>{t}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if l.type && subsOfType(opts.typeSubs, l.type).length}
          <div class="field">
            <label>التفصيل <span class="muted tiny">— {l.type}</span></label>
            <div class="row wrap" style="gap:8px">
              {#each subsOfType(opts.typeSubs, l.type) as st (st)}
                <button type="button" class="chip" class:on={l.typeSub === st} onclick={() => { l.typeSub = l.typeSub === st ? '' : st; l.typeSub2 = ''; l.typeSub3 = ''; }}>{st}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if l.type && l.typeSub && subsOfType2(opts.typeSubs2, l.type, l.typeSub).length}
          <div class="field">
            <label>تفصيل أدق <span class="muted tiny">— {l.typeSub}</span></label>
            <div class="row wrap" style="gap:8px">
              {#each subsOfType2(opts.typeSubs2, l.type, l.typeSub) as st2 (st2)}
                <button type="button" class="chip" class:on={l.typeSub2 === st2} onclick={() => { l.typeSub2 = l.typeSub2 === st2 ? '' : st2; l.typeSub3 = ''; }}>{st2}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if l.type && l.typeSub && l.typeSub2 && subsOfType3(opts.typeSubs3, l.type, l.typeSub, l.typeSub2).length}
          <div class="field">
            <label>تفصيل أخير <span class="muted tiny">— {l.typeSub2}</span></label>
            <div class="row wrap" style="gap:8px">
              {#each subsOfType3(opts.typeSubs3, l.type, l.typeSub, l.typeSub2) as st3 (st3)}
                <button type="button" class="chip" class:on={l.typeSub3 === st3} onclick={() => (l.typeSub3 = l.typeSub3 === st3 ? '' : st3)}>{st3}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if opts.seasons.length}
          <div class="field">
            <label>الموسم</label>
            <div class="row wrap" style="gap:8px">
              {#each opts.seasons as s (s)}
                <button type="button" class="chip" class:on={l.season === s} onclick={() => (l.season = l.season === s ? '' : s)}>{s}</button>
              {/each}
            </div>
          </div>
        {/if}

        {#if opts.materials.length}
          <div class="field">
            <label>المادة</label>
            <div class="row wrap" style="gap:8px">
              {#each opts.materials as m (m)}
                <button type="button" class="chip" class:on={l.material === m} onclick={() => (l.material = l.material === m ? '' : m)}>{m}</button>
              {/each}
            </div>
          </div>
        {/if}

        <ColorSwatches bind:value={l.color} colors={opts.colors} />

        <div class="row" style="gap:10px">
          <div class="field" style="flex:1">
            <label>التكلفة (د.ع)</label>
            <input class="input" bind:value={l.cost} inputmode="decimal" placeholder="0" />
          </div>
          <div class="field" style="flex:1">
            <label>سعر البيع (د.ع)</label>
            <input class="input" bind:value={l.price} inputmode="decimal" placeholder="0" />
          </div>
        </div>

        <div class="field">
          <label>المقاسات المستلمة</label>
          <SizeQtyGrid sizes={SIZE_RUNS[l.category] || SIZE_RUNS['نسائية']} bind:value={l.sizes} />
        </div>
      </div>
      {/if}
    </Glass>
  {/each}

  <div class="field">
    <label>ملاحظة الفاتورة <span class="muted tiny">(اختياري)</span></label>
    <input class="input" bind:value={note} placeholder="مثال: دفعة ثانية، مقاسات كبيرة…" />
  </div>

  <Glass class="totals" radius="var(--r-md)">
    <div class="row" style="justify-content:space-between">
      <span class="muted">القطع المستلمة</span>
      <span class="bold">{fmtNum(totalPieces)} قطعة</span>
    </div>
    <div class="row" style="justify-content:space-between">
      <span class="muted">أول تكلفة تقديرية</span>
      <span class="money">{fmtIQD(lines.reduce((a, l) => a + iqd(l.cost) * linePieces(l), 0))}</span>
    </div>
  </Glass>

  <button class="btn primary lg block" onclick={save} disabled={saving || !canSave}>
    <Icon name="check" size={20} /> استلام الفاتورة
  </button>
</div>

<input type="file" accept="image/*" capture="environment" style="display:none" bind:this={camInput} onchange={(e) => onLinePhoto(photoLine, e)} />
<input type="file" accept="image/*" style="display:none" bind:this={galInput} onchange={(e) => onLinePhoto(photoLine, e)} />

<PhotoSourceSheet open={photoSrcOpen} onclose={() => (photoSrcOpen = false)} onpick={pickPhotoSource} />

<style>
  :global(.head-card) { display: flex; align-items: center; gap: 12px; padding: 13px 15px; }
  .h-ic {
    flex: none; width: 42px; height: 42px; border-radius: 13px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(164, 128, 62, 0.3);
  }
  .req { color: var(--burgundy); font-weight: 800; }

  .head-count {
    flex: none; font-size: 11.5px; font-weight: 800; color: var(--burgundy-deep);
    background: rgba(181, 73, 91, 0.09); border-radius: 999px; padding: 5px 11px;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .head-count b { font-size: 13.5px; }

  :global(.line) { padding: 0; overflow: hidden; }
  /* السطر المفتوح يبان: إطار نبيتي خفيف */
  :global(.line.is-open) { border-color: rgba(181, 73, 91, 0.38) !important; }

  .ln-head {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 11px;
    background: rgba(181, 73, 91, 0.06);
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition: background 0.18s;
  }
  .ln-head:active { background: rgba(181, 73, 91, 0.12); }
  :global(.line.is-folded) .ln-head { border-bottom: none; }

  .ln-thumb {
    flex: none; width: 38px; height: 38px; border-radius: 10px;
    overflow: hidden; display: flex; align-items: center; justify-content: center;
    background: rgba(122, 46, 58, 0.07); border: 1px solid var(--line);
  }
  .ln-thumb.has { border-color: rgba(181, 73, 91, 0.38); }
  .ln-thumb img { width: 100%; height: 100%; object-fit: cover; }

  .ln-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .ln-n { font-size: 12.5px; font-weight: 800; color: var(--burgundy-deep); }
  .ln-title { color: var(--ink); font-weight: 800; }
  .ln-sub {
    font-size: 11px; font-weight: 700; color: var(--ink-2);
    font-variant-numeric: tabular-nums;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ln-sub.dim { color: var(--taupe); }
  .ln-none { color: var(--taupe); font-weight: 700; font-style: normal; }
  .ln-warn { flex: none; display: flex; align-items: center; }

  .ln-pieces {
    flex: none;
    font-size: 11px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.07);
    border-radius: 999px; padding: 3px 9px; white-space: nowrap;
  }
  .ln-pieces.has { color: var(--good); background: rgba(78, 138, 95, 0.12); }
  .ln-x {
    flex: none;
    width: 26px; height: 26px; border-radius: 8px;
    border: 1px solid var(--line-2); background: rgba(255, 255, 255, 0.6);
    color: var(--burgundy); cursor: pointer; padding: 0;
    display: flex; align-items: center; justify-content: center;
  }
  /* سهم الفتح/الطوي — نفس نمط .chev في التقارير */
  .ln-chev {
    flex: none; width: 7px; height: 7px;
    border-inline-end: 2px solid var(--taupe); border-bottom: 2px solid var(--taupe);
    transform: rotate(-45deg);
    transition: transform 0.2s ease;
  }
  .ln-chev.open { transform: rotate(45deg); }

  .ln-body { padding: 12px 13px; display: flex; flex-direction: column; gap: 2px; }

  .lines-bar { display: flex; align-items: center; gap: 8px; padding: 0 4px; }
  .lb-txt { flex: 1; font-size: 12px; font-weight: 800; color: var(--ink-2); }
  .lb-txt b { color: var(--burgundy-deep); }
  .lb-dim { color: var(--taupe); font-weight: 700; }
  .lb-btn {
    font-family: inherit; font-size: 11px; font-weight: 800;
    color: var(--taupe);
    background: rgba(122, 46, 58, 0.06);
    border: 1px solid var(--line-2); border-radius: 999px;
    padding: 5px 11px; cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .lb-btn:active { transform: scale(0.94); }
  .lb-btn:disabled { opacity: 0.4; cursor: default; }

  .ln-photo {
    width: 56px; height: 56px; flex: none;
    border-radius: 14px;
    border: 1.5px dashed var(--line-2);
    background: rgba(255, 255, 255, 0.5);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; overflow: hidden; position: relative;
    /* صار <button> بدل <label> — نصفّر افتراضيات الزر */
    padding: 0; font-family: inherit; color: inherit;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .ln-photo:active { transform: scale(0.96); }
  .ln-photo-lg { width: 92px; height: 92px; flex-direction: column; gap: 4px; }
  .ph-hint { font-size: 10.5px; font-weight: 800; color: var(--taupe); }
  .ln-photo.has { border-style: solid; border-color: rgba(181, 73, 91, 0.4); }
  .ln-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .add-row { display: flex; gap: 8px; }
  .add-line {
    flex: 1;
    border-style: dashed;
    border-width: 1.5px;
    border-color: rgba(181, 73, 91, 0.4);
    color: var(--burgundy);
    background: rgba(255, 255, 255, 0.35);
    justify-content: center;
    min-height: 48px;
    font-size: 12.5px;
    padding: 6px 10px;
    gap: 6px;
    line-height: 1.25;
    text-align: center;
  }
  .add-line.same { border-color: rgba(201, 162, 75, 0.45); color: #8a6a35; }
  :global(.totals) { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
</style>
