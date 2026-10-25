<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import Pick from '../components/Pick.svelte';
  import ColorSwatches from '../components/ColorSwatches.svelte';
  import SizeQtyGrid from '../components/SizeQtyGrid.svelte';
  import PhotoSourceSheet from '../components/PhotoSourceSheet.svelte';
  import { db, addProduct, updateProduct, addLot, modelOptions, modelGroupKey, hexForColor, SIZE_RUNS, modelKey, nextModelId, subsOfType, subsOfType2, subsOfType3, getSetting, setSetting, seasonsOf, loadProducts, cardIsReferenced, sweepDuplicateVariants } from '../db.js';
  import { fmtIQD, fmtNum, buzz, iqd, fileToPhotoDataUrl, baghdadLocalInput, isoFromBaghdadLocal } from '../utils.js';
  import { toastOk, toastErr, celebrateAt, campaignContacts } from '../store.js';

  let { product = null, photo = null, ondone = () => {}, goto = () => {} } = $props();

  const editing = !!product;
  const NOCOLOR = 'بلا لون';

  /* الصورة هي الهوية — لا اسم موديل. يُشتق اسم داخلي من النوع واللون فقط
     لغرض تجميع بطاقات نفس الموديل (الألوان × المقاسات) ودمج الاستلامات.
     ملاحظة: الاشتقاق هنا لأن التصنيف يُعبّأ من الموديل إن ترك فارغاً —
     لا يتأثر بحالة «إلغاء تحديد النوع» أثناء التعديل. */
  let category = $state(product?.category ?? '');
  let type = $state(product?.type ?? '');
  let typeSub = $state(product?.typeSub ?? ''); // القائمة الثانية تحت النوع
  let typeSub2 = $state(product?.typeSub2 ?? ''); // القائمة الثالثة تحت التفصيل
  let typeSub3 = $state(product?.typeSub3 ?? ''); // القائمة الرابعة تحت تفصيل أدق
  let brand = $state(product?.brand ?? '');
  let seasons = $state(Array.isArray(product?.seasons) && product.seasons.length ? [...product.seasons] : (product?.season ? [product.season] : []));
  let material = $state(product?.material ?? '');
  let cost = $state(product?.cost ?? '');
  let price = $state(product?.price ?? '');
  let notes = $state(product?.notes ?? '');
  let supplier = $state(product?.supplier ?? '');
  let suppliers = $state([]);

  /* ---- وصول دفعة لموديل موجود (إضافة فقط) ----
     نفس الحذاء يُشترى من مورد آخر بتكلفة وسعر مختلفين. لا نستنتج الهوية أبداً:
     الموديل تختاره صاحبة البوتيك بنفسها، والداخل يُسجَّل دفعةً داخل رقمه. */
  let batchOpen = $state(false);
  let batchModelId = $state('');
  let batchModels = $state([]);
  $effect(() => {
    if (editing) return;
    let alive = true;
    loadProducts().then((ps) => {
      if (!alive) return;
      const map = new Map();
      for (const p of ps) {
        const mid = modelGroupKey(p);
      const cur = map.get(mid) || { modelId: mid, chain: '', colors: new Set(), qty: 0, img: '' };
      cur.qty += Number(p.qty) || 0;
      if ((p.color || '').trim()) cur.colors.add(p.color.trim());
      if (!cur.img && (p.img || '')) cur.img = p.img;
      if (!cur.chain) cur.chain = [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ') || p.category || 'موديل';
        map.set(mid, cur);
      }
      batchModels = [...map.values()]
        .filter((m) => m.qty > 0)
        .map((m) => ({ ...m, colors: [...m.colors].join('، ') }))
        .sort((a, b) => a.chain.localeCompare(b.chain, 'ar'));
    });
    return () => { alive = false; };
  });

  /* وقت الوصول للرف: افتراضياً «الآن» بتوقيت بغداد، وقابل للتعديل.
     الرکود ونسبة التصريف وترتيب الأحدث ودفتر الشهر كلها تحسب من هذه اللحظة. */
  let ts = $state(baghdadLocalInput());
  let tsIsNow = $state(!product); // الإضافة تبدأ «الآن» — التعديل يحمل وقت الموديل الحالي
  /* المستقبل غير مشروع — أي وقت بعد «الآن» يُرجع فوراً للآن */
  function onTsChange() {
    if (!ts) { tsIsNow = false; return; }
    const iso = isoFromBaghdadLocal(ts);
    if (iso && new Date(iso).getTime() > Date.now() + 60000) {
      ts = baghdadLocalInput();
      tsIsNow = true;
      toastErr('وقت الوصول لا يمكن أن يكون بالمستقبل');
      buzz([30, 40, 30]);
      return;
    }
    tsIsNow = false;
  }
  function tsToNow() {
    ts = baghdadLocalInput();
    tsIsNow = true;
    buzz(8);
  }

  /* multi-color × multi-size: one card per selected color */
  let selColors = $state([]); // color labels ('' stored as NOCOLOR)
  let byColor = $state({});   // label → { size: qty }

  /* حقول كانت ناقصة أصلاً في الموديل المفتوح للتعديل. لا نُطالب بها عند
     الحفظ — وإلا امتنع تعديل لون أو مقاس في أي موديل قديم سابق لقوائم
     التفصيل/الموسم، بلا ذنب لصاحبته. (٤ موديلات في بوتيك غزالة كانت
     محجوبة تماماً عن الحفظ لهذا السبب.) */
  let origGaps = $state({});
  const gap = (k) => editing && !!origGaps[k];

  let opts = $state({ categories: [], types: [], seasons: [], materials: [], colors: [], typeSubs: {} });
  (async () => {
    suppliers = (await getSetting('suppliers', [])) || [];
    /* أول مورد جاهز مُختار سلفاً — لا «بدون» في التطبيق.
       في التعديل لا تعبئة تلقائية: الموديل القديم بلا مورد يبقى كما هو —
       التعبئة كانت تعيد كتابة مورد كل بطاقات الموديل عند الحفظ */
    if (!editing && !supplier && suppliers.length) supplier = suppliers[0];
  })();
  (async () => {
    opts = await modelOptions();
    if (product) {
      /* group by the internal model number — الصورة هي الهوية، والرقم هو الجامع */
      const all = await loadProducts();
      const group = product.modelId
        ? all.filter((x) => x.modelId === product.modelId)
        : all.filter((x) =>
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
      /* الشجرة والمواسم من الموديل كله — أول قيمة موجودة بين القطع (البطاقة
         المضغوطة قد تكون خالية منها بينما أخواتها حاملاتها) */
      const pick = (k) => group.map((x) => x[k]).find(Boolean) || '';
      if (!type) type = pick('type');
      if (!typeSub) typeSub = pick('typeSub');
      if (!typeSub2) typeSub2 = pick('typeSub2');
      if (!typeSub3) typeSub3 = pick('typeSub3');
      seasons = [...new Set([...seasons, ...group.flatMap((x) => seasonsOf(x))])];
      /* وقت الوصول المعروض: أقدم لحظة وصول بين قطع الموديل */
      if (group.length) {
        const earliest = Math.min(...group.map((x) => new Date(x.createdAt || x.updatedAt || Date.now()).getTime()));
        ts = baghdadLocalInput(new Date(earliest));
        tsIsNow = false;
      }
      /* بعد أن اكتملت قراءة الموديل: سجّلي ما كان ناقصاً فيه أصلاً */
      origGaps = {
        typeSub: !typeSub, typeSub2: !typeSub2, typeSub3: !typeSub3,
        season: seasons.length === 0, material: !material, supplier: !(supplier || '').trim()
      };
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
  let galInput;
  let photoSrcOpen = $state(false);

  /* اختيار مصدر الصورة: كاميرا أو معرض. الكاميرا وحدها كانت مفروضة بـ
     capture="environment"، فلا سبيل لاختيار صورة موجودة في الهاتف. */
  function pickPhotoSource(src) {
    photoSrcOpen = false;
    setTimeout(() => (src === 'gallery' ? galInput : camInput)?.click(), 180);
  }

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

  /* الموسم تعدد اختيار — القطعة تُعرض في كل مواسمها */
  function toggleSeason(s) {
    seasons = seasons.includes(s) ? seasons.filter((x) => x !== s) : [...seasons, s];
    buzz(6);
  }

  /* الاسم الداخلي المشتق — تعريفه هنا فقط لأنه يقرأ الحالات بعد تعريفها كلها
     (نسخة سابقة عرّفته قبل التصنيف: ReferenceError خفي عند أول تنفيذ) */
  const autoName = $derived(
    [type, typeSub, typeSub2, typeSub3, selColors[0] && selColors[0] !== NOCOLOR ? selColors[0] : ''].filter(Boolean).join(' ') ||
    category ||
    'موديل'
  );

  /* القائمة الفرعية تتغير مع النوع. نمسح التفاصيل التابعة فقط حين يتغيّر الأب
     فعلاً — لا لمجرد أنها قيمة حرّة غير موجودة في المقترحات، حتى يسعى إدخال
     نوع أو تفصيل جديد بالنص تماماً كما في طلب قائمة الانتظار. */
  const subsNow = $derived(subsOfType(opts.typeSubs, type));
  const subs2Now = $derived(subsOfType2(opts.typeSubs2, type, typeSub));
  const subs3Now = $derived(subsOfType3(opts.typeSubs3, type, typeSub, typeSub2));
  let _pt = type, _ps = typeSub, _ps2 = typeSub2;
  $effect(() => {
    if (type !== _pt) { _pt = type; typeSub = ''; typeSub2 = ''; typeSub3 = ''; }
    else if (typeSub !== _ps) { _ps = typeSub; typeSub2 = ''; typeSub3 = ''; }
    else if (typeSub2 !== _ps2) { _ps2 = typeSub2; typeSub3 = ''; }
  });

  const baseSizes = $derived(SIZE_RUNS[category] || SIZE_RUNS['نسائية']);
  const colorPieces = (c) => Object.values(byColor[c] || {}).reduce((a, n) => a + (Number(n) || 0), 0);
  const totalPieces = $derived(selColors.reduce((a, c) => a + colorPieces(c), 0));
  const totalSizes = $derived(selColors.reduce((a, c) => a + Object.values(byColor[c] || {}).filter((n) => n > 0).length, 0));

  /* نص زر الحفظ يقرأ اختيارات المستخدمة فعلاً — القطع بالصيغة الصحيحة،
     وأسماء الألوان والمقاسات المختارة، لا مجرد أرقام مجهولة */
  const piecesWord = (n) =>
    n === 1 ? 'قطعة واحدة' : n === 2 ? 'قطعتين' : n <= 10 ? `${fmtNum(n)} قطع` : `${fmtNum(n)} قطعة`;
  const selColorsOn = $derived(selColors.filter((c) => colorPieces(c) > 0));
  const selSizesOn = $derived(
    [...new Set(selColors.flatMap((c) => Object.entries(byColor[c] || {}).filter(([, n]) => Number(n) > 0).map(([s]) => s)))]
      .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0))
  );
  const saveSummary = $derived.by(() => {
    const parts = [];
    const names = selColorsOn.map((c) => (c === NOCOLOR ? 'بلا لون' : c));
    if (names.length === 1) parts.push(names[0]);
    else if (names.length === 2) parts.push(names.join(' + '));
    else if (names.length > 2) parts.push(`${fmtNum(names.length)} ألوان`);
    if (selSizesOn.length === 1) parts.push(`مقاس ${selSizesOn[0]}`);
    else if (selSizesOn.length > 1) parts.push(`${fmtNum(selSizesOn.length)} مقاسات`);
    return parts.join(' - ');
  });

  const profit = $derived(Math.max(0, iqd(price) - iqd(cost)));
  const margin = $derived(iqd(price) > 0 ? Math.round((profit / iqd(price)) * 100) : 0);

  /* everything is required except notes — الصورة إجبارية: هي هوية الموديل */
  const missing = $derived.by(() => {
    const m = [];
    /* في وضع «دفعة لموديل موجود» الهوية (صورة/تصنيف/نوع/موسم/مادة) تأتي من
       الموديل نفسه — لا نطالب بها مرة أخرى، وإلا صار إدخال الدفعة أثقل من
       تسجيل موديل جديد. */
    if (!batchModelId) {
      if (!img) m.push('الصورة');
      if (!category) m.push('التصنيف');
      if (!type) m.push('النوع');
      /* تفصيلات النوع المعرّفة في الإعدادات تصبح إجبارية مثل النوع نفسه —
         إلا ما كان ناقصاً في الموديل أصلاً وقت فتحه للتعديل: لا نحجب تعديل
         لون أو مقاس بسبب فراغ لم تصنعه صاحبة البوتيك */
      if (!typeSub && subsNow.length && !gap('typeSub')) m.push('التفصيل');
      if (!typeSub2 && subs2Now.length && !gap('typeSub2')) m.push('تفصيل أدق');
      if (!typeSub3 && subs3Now.length && !gap('typeSub3')) m.push('تفصيل أخير');
      if (!seasons.length && !gap('season')) m.push('الموسم');
      if (!material && !gap('material')) m.push('المادة');
    }
    if (!selColors.length) m.push('اللون');
    if (!supplier.trim() && !gap('supplier')) m.push('المورد');
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

  /* ---- الحفظ كدفعة داخل موديل قائم ----
     البطاقة التي تجمع (لون+مقاس) موجودة؟ تُضاف دفعة على كودها — لا بطاقة
     جديدة ولا كتابة فوق تكلفة قديمة. اللون غير الموجود بعد يصير بطاقة جديدة
     في الموديل نفسه (لون آخر لنفس الحذاء). */
  async function saveAsBatch() {
    const all = await loadProducts();
    const mates = all.filter((x) => x.modelId === batchModelId);
    if (!mates.length) { toastErr('الموديل المختار لم يعد موجوداً'); return; }
    const lead = mates[0];
    const nowIso = new Date().toISOString();
    const arrivalIso = tsIsNow ? nowIso : (isoFromBaghdadLocal(ts) || nowIso);
    const c = iqd(cost), pr = iqd(price);
    const sup = supplier.trim();
    const note = `دفعة جديدة — ${sup || 'بدون مورد'}`;
    let lots = 0, cards = 0, pieces = 0;
    for (const cl of selColors) {
      const color = cl === NOCOLOR ? '' : cl;
      for (const [rawSize, rawQty] of Object.entries(byColor[cl] || {})) {
        const q = Math.max(0, Math.round(Number(rawQty) || 0));
        const sz = String(rawSize).trim() === '—' ? '' : String(rawSize).trim();
        if (!q) continue;
        const twin = mates.find((x) => (x.color || '').trim() === color && String(x.size || '').trim() === sz);
        if (twin) {
          await addLot({ sku: twin.sku, supplier: sup, cost: c, price: pr, qty: q, receivedAt: arrivalIso, note });
          await updateProduct(twin.sku, {
            supplier: sup, supplierAt: nowIso,
            notes: notes.trim() || twin.notes || '',
            ...(seasons.length ? { seasons: [...seasons], season: seasons[0] } : {}),
            ...(material ? { material } : {})
          });
        } else {
          await addProduct({
            name: lead.name, category: lead.category,
            type: lead.type || type, typeSub: lead.typeSub || typeSub,
            typeSub2: lead.typeSub2 || typeSub2, typeSub3: lead.typeSub3 || typeSub3,
            brand: brand.trim() || lead.brand || '',
            seasons: seasons.length ? [...seasons] : seasonsOf(lead),
            season: seasons[0] || lead.season || '',
            material: material || lead.material || '',
            cost: c, price: pr, qty: q, supplier: sup, supplierAt: nowIso,
            color, size: sz, notes: notes.trim(), modelId: batchModelId,
            photo: img && !lead.photo ? img : null
          }, { moveNote: note });
          cards++;
        }
        lots++; pieces += q;
      }
    }
    if (!lots) { toastErr('ما فيه كميات لإضافتها'); return; }
    buzz([20, 50, 20]);
    celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '📦');
    toastOk(`دفعة جديدة داخل «${lead.name || 'الموديل'}» — ${fmtNum(pieces)} قطعة${cards ? ` (${fmtNum(cards)} بطاقة جديدة)` : ''}`);
    ondone();
  }

  async function save() {
    if (!valid) {
      tried = true;
      buzz([30, 40, 30]);
      toastErr(`مطلوب: ${missing.slice(0, 3).join('، ')}${missing.length > 3 ? '…' : ''}`);
      /* مرّري العين لأول حقل ناقص — الحفظ الفاشل لا يُترك بلا وجهة */
      await new Promise((r) => setTimeout(r, 60));
      const firstBad = document.querySelector('.err-line, .photo-tile.need, .color-block.bad');
      firstBad?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    /* دفعة داخل موديل قائم — مسار مستقل تماماً عن تسجيل موديل جديد */
    if (!editing && batchModelId) {
      try {
        const supName = (supplier || '').trim();
        if (supName) {
          const reg = (await getSetting('suppliers', [])) || [];
          if (!reg.includes(supName)) await setSetting('suppliers', [...reg, supName]);
        }
        await saveAsBatch();
      } catch (e) {
        toastErr('حدث خطأ أثناء حفظ الدفعة');
        console.error(e);
      }
      return;
    }
    try {
      /* supplier typed without a registry? — register it so it appears in every dropdown next time */
      const supName = (supplier || '').trim();
      if (supName) {
        const reg = (await getSetting('suppliers', [])) || [];
        if (!reg.includes(supName)) await setSetting('suppliers', [...reg, supName]);
      }
      /* الرقم الداخلي: التعديل يحتفظ برقم الموديل، والتسجيل الجديد يأخذ رقماً جديداً
         دائماً — لا يُستعار رقم موديل قديم أبداً.
         الاسم الداخلي مشتق من النوع + أول لون فقط، فموديلان مختلفان فعلاً (صورة
         وسعر وتكلفة مختلفة) يتقاسمان الاسم نفسه — وكانت الاستعارة تدمجهما في بطاقة
         واحدة تخلط الصور والأسعار وتضخّم الكميات بصمت.
         لإضافة لون آخر لنفس الموديل: افتحي الموديل ← «تعديل»، أو استعملي
         «لون آخر لنفس الموديل» في فاتورة الوارد — كلاهما يشارك الرقم عن قصد. */
      const all0 = await loadProducts();
      const freshId = product?.modelId || (await nextModelId());
      /* وقت الوصول: يُكتب فقط حين تُعدّله يدوياً — «الآن» يتركه لقاعدة البيانات */
      const arrivalIso = tsIsNow ? null : isoFromBaghdadLocal(ts);
      const withArrival = arrivalIso ? { createdAt: arrivalIso } : {};
      const base = {
        name: (product?.name || '').trim() || autoName, category, type, typeSub, typeSub2, typeSub3,
        brand: brand.trim(),
        seasons, season: seasons[0] || '', material, cost: iqd(cost), price: iqd(price), photo: img, notes: notes.trim(),
        supplier: (supplier || '').trim(),
        modelId: freshId
      };
      /* المطابقة مع بطاقة موجودة تكون مع بطاقات الموديل الذي نُعدّله وحده.
         بعد منع الاستعارة صار ممكناً أن يتقاسَم موديلان مفتاحاً واحداً
         (اسم+تصنيف+مقاس+لون)، فمطابقة غير مقيّدة كانت ستختطف بطاقة موديل آخر. */
      const ownCards = !editing ? [] : (product.modelId
        ? all0.filter((x) => x.modelId === product.modelId)
        : all0.filter((x) =>
            (x.name || '').trim().toLowerCase() === (product.name || '').trim().toLowerCase() &&
            x.category === product.category));
      const idx = new Map(ownCards.map((p) => [modelKey(p), p]));
      const touched = new Set();
      let updated = 0, created = 0;
      /* المتغيّرات التي لا بطاقة لها بعد — تُعالَج بعد معرفة البطاقات المتاحة */
      const pending = [];

      for (const c of selColors) {
        const color = c === NOCOLOR ? '' : c;
        for (const [rawSize, rawQty] of Object.entries(byColor[c] || {})) {
          const q = Math.max(0, Math.round(Number(rawQty) || 0));
          const size = String(rawSize).trim();
          const sz = size === '—' ? '' : size;
          /* idx فارغ في وضع الإضافة ⇒ لا «توأم» أبداً ⇒ كل تسجيل جديد يُنشئ
             بطاقاته بكوده الخاص ولا يُدمج في موديل قائم. الدمج الصامت كان يضخّم
             الكميات ويطمس التكلفة والسعر الحقيقيين (وقد حدث فعلاً). */
          const twin = idx.get(modelKey({ name: base.name, category: base.category, size: sz, color }));
          if (twin) {
            /* مسار التعديل فقط: مقاس/لون داخل نفس الموديل. الكميات المحفوظة أو
               المعدّلة على الرف لا تُصفّر ساعة الرکود — updateProduct يتولى ذلك */
            await updateProduct(twin.sku, { ...base, color, size: sz, qty: q, modelId: twin.modelId || freshId, ...withArrival });
            touched.add(twin.sku);
            updated++;
          } else if (q > 0) {
            pending.push({ color, sz, q });
          }
        }
      }

      if (editing) {
        /* البطاقات التي خرج متغيّرها من الشبكة.
           كانت تُصفَّر وتبقى — فتظهر للمستخدمة كأن اللون «تكرّر»: بطاقة جديدة
           + بطاقة قديمة صفرية. الآن البطاقة التي لا يشير إليها بيع ولا حجز ولا
           انتظار **يُعاد استخدامها**: يتغيّر لونها ومقاسها بنفس الكود فتُحلّ
           محلّ المتغيّر الجديد. لا بطاقة جديدة ولا بقايا، والكود يبقى كما هو
           فتظل حركاته ورقمه صحيحين. والبطاقة المرتبطة ببيع أو حجز تبقى كما هي
           (تُصفَّر) لأن تاريخها لا يُمحى. */
        const spares = [];
        for (const x of ownCards) {
          if (touched.has(x.sku)) continue;
          if (await cardIsReferenced(x.sku)) continue;
          spares.push(x);
        }
        const stillPending = [];
        for (const n of pending) {
          const spare = spares.shift();
          if (!spare) { stillPending.push(n); continue; }
          await updateProduct(spare.sku, { ...base, color: n.color, size: n.sz, qty: n.q, modelId: spare.modelId || freshId, ...withArrival });
          touched.add(spare.sku);
          updated++;
        }
        pending.length = 0;
        pending.push(...stillPending);

        /* ما تبقّى لم يُلمس: متغيّر مُزال فعلاً، أو بطاقة لها مرجع خارجي */
        for (const x of ownCards) {
          if (touched.has(x.sku)) continue;
          if ((Number(x.qty) || 0) !== 0) { await updateProduct(x.sku, { qty: 0 }); updated++; }
        }
        /* حارس: لا يبقى متغيّران بنفس اللون والمقاس في هذا الموديل */
        await sweepDuplicateVariants(freshId);
      }

      /* ما لم يجد بطاقة يُعاد استخدامها (إضافة، أو زيادة عدد المتغيّرات) */
      for (const n of pending) {
        const p = await addProduct({ ...base, color: n.color, size: n.sz, qty: n.q, ...withArrival });
        touched.add(p.sku);
        created++;
      }

      buzz([20, 50, 20]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.5, '👠');
      const parts = [];
      if (updated) parts.push(`${updated} بطاقة محفوظة`);
      if (created) parts.push(`${created} جديدة`);
      toastOk(`${editing ? 'تم الحفظ' : 'تمت الإضافة'} — ${totalPieces} قطعة (${parts.join(' - ')})`);
      /* الأولوية لقائمة الانتظار: زبونة سجّلت طلب حذاء غير موجود بنفس السلسلة
         فتعرّفه الحين فور تسجيله في المخزون — بيع مضمون قبل «قبل الجميع». */
      if (created > 0) {
        try {
          const { findWaitingMatchesForSkus } = await import('../db.js');
          const matched = await findWaitingMatchesForSkus([...touched]);
          if (matched.length) {
            const firstSku = [...touched][0];
            const first = firstSku ? await db.products.get(firstSku) : null;
            campaignContacts.set({
              kind: 'waiting',
              model: first ? {
                modelId: first.modelId,
                chain: [first.type, first.typeSub, first.typeSub2, first.typeSub3].filter(Boolean).join(' - ') || '—',
                colors: first.color || '—', sizes: String(first.size || ''), price: first.price
              } : null,
              contacts: matched.map((w) => ({ name: w.customerName, phone: w.customerPhone }))
            });
            ondone();
            goto('broadcast');
            return;
          }
        } catch { /* لا تعطل الحفظ أبداً */ }
      }
      /* «قبل الجميع»: أول تسجيل لموديل واصل بكمية — كبار الزبونات أول من يعرف */
      if (!editing && created > 0 && totalPieces > 0) {
        try {
          const { firstdibsCampaign } = await import('../db.js');
          const chain = [type, typeSub, typeSub2, typeSub3].filter(Boolean).join(' - ') || category;
          const colors = selColors.filter((c) => c && c !== 'بلا لون').join('، ') || '—';
          const campaign = await firstdibsCampaign({ modelId: freshId, chain, colors, sizes: '—', price: iqd(price) });
          if (campaign.contacts.length) { campaignContacts.set(campaign); ondone(); goto('broadcast'); return; }
        } catch { /* لا تعطل الحفظ أبداً */ }
      }
      ondone();
    } catch (e) {
      toastErr('حدث خطأ أثناء الحفظ');
      console.error(e);
    }
  }
</script>

<div class="stack" style="gap:14px">
  <!-- وصول دفعة لموديل موجود: نفس الحذاء من مورّد آخر. الهوية (الصورة/النوع)
       تبقى للموديل المختار، والداخل يُسجَّل دفعةً بمورّدها وتكلفتها وسعرها. -->
  {#if !editing}
    <Glass class="batch-card" radius="var(--r-md)">
      <button type="button" class="batch-top" onclick={() => { buzz(6); batchOpen = !batchOpen; if (!batchOpen) batchModelId = ''; }}>
        <span class="batch-ic"><Icon name={batchModelId ? 'check' : 'box'} size={17} color={batchModelId ? 'var(--good)' : 'var(--burgundy)'} /></span>
        <span class="batch-txt">
          <span class="batch-t">وصول دفعة لموديل موجود؟</span>
          <span class="muted tiny">نفس الحذاء من مورّد ثانٍ — تُضاف دفعةً داخل الموديل، لا بطاقة مكرّرة</span>
        </span>
        <span class="chev" class:flip={batchOpen}><Icon name="back" size={13} /></span>
      </button>
      {#if batchOpen}
        <div class="batch-body">
          {#if batchModels.length}
            <div class="batch-grid">
              {#each batchModels as m (m.modelId)}
                <button type="button" class="batch-mod" class:on={batchModelId === m.modelId} onclick={() => { batchModelId = m.modelId; buzz(6); }}>
                  <span class="bm-img">{#if m.img}<img src={m.img} alt="" />{:else}<Icon name="image" size={24} color="var(--taupe)" />{/if}</span>
                  <span class="bm-cap">{m.chain}</span>
                  <span class="bm-qty">{fmtNum(m.qty)} قطعة</span>
                </button>
              {/each}
            </div>
          {:else}
            <p class="muted tiny" style="margin:0">لا موديلات على الرف بعد — أول تسجيل يفتح موديله.</p>
          {/if}
          {#if batchModelId}
            <p class="batch-note">
              ستُسجَّل كدفعة داخل الموديل المختار: الصورة والنوع يبقيان له، ولكِ التكلفة والسعر والمورّد.
            </p>
          {/if}
        </div>
      {/if}
    </Glass>
  {/if}

  {#if !batchModelId}
  <!-- الصورة أولاً: أوسع، بالمنتصف، هي هوية الموديل -->
  <div class="field photo-field">
    <div class="photo-wrap">
      <button type="button" class="photo-tile" class:has={!!img} class:need={isMissing('الصورة')} onclick={() => (photoSrcOpen = true)}>
        {#if img}
          <img src={img} alt="preview" />
          <span class="re-take"><Icon name="image" size={13} /> تغيير</span>
        {:else}
          <Icon name="image" size={40} color="var(--taupe)" />
          <span class="ph-txt">صوّري الحذاء</span>
        {/if}
      </button>
      {#if img}<span class="ph-x-wrap"><button type="button" class="ph-x" aria-label="إزالة الصورة" onclick={() => { img = null; }}><Icon name="x" size={13} /></button></span>{/if}
      <input type="file" accept="image/*" capture="environment" style="display:none" bind:this={camInput} onchange={onPhoto} />
      <input type="file" accept="image/*" style="display:none" bind:this={galInput} onchange={onPhoto} />
    </div>
    {#if isMissing('الصورة')}<span class="err-line">الصورة مطلوبة — صوّري الحذاء</span>{/if}
  </div>

  <div class="field">
    <label>التصنيف *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.categories as c (c)}
        <button type="button" class="chip" class:on={category === c} onclick={() => (category = c)}>{c}</button>
      {/each}
    </div>
  </div>

  <!-- شجرة النوع: التفاصيل كلها تتدلى من النوع بخيط ذهبي — واضح أنها أبناؤه -->
  <div class="field type-group">
    <label>النوع *</label>
    <div class="row wrap" style="gap:8px">
      {#each opts.types as t (t)}
        <button type="button" class="chip" class:on={type === t} onclick={() => (type = type === t ? '' : t)}>{t}</button>
      {/each}
    </div>
    {#if type && subsNow.length}
      <div class="sub-level">
        <label class="sub-label">التفصيل <span class="req" style="color:var(--burgundy)">*</span> <span class="muted tiny">— تحت «{type}»</span></label>
        <div class="row wrap" style="gap:6px; {isMissing('التفصيل') ? 'outline:2px solid rgba(181,73,91,0.5); outline-offset:4px; border-radius:14px' : ''}">
          {#each subsNow as st (st)}
            <button type="button" class="chip chip-sub" class:on={typeSub === st} onclick={() => (typeSub = typeSub === st ? '' : st)}>{st}</button>
          {/each}
        </div>
      </div>
      {#if typeSub && subs2Now.length}
        <div class="sub-level">
          <label class="sub-label">تفصيل أدق <span class="req" style="color:var(--burgundy)">*</span> <span class="muted tiny">— تحت «{typeSub}»</span></label>
          <div class="row wrap" style="gap:6px; {isMissing('تفصيل أدق') ? 'outline:2px solid rgba(181,73,91,0.5); outline-offset:4px; border-radius:14px' : ''}">
            {#each subs2Now as st2 (st2)}
              <button type="button" class="chip chip-sub" class:on={typeSub2 === st2} onclick={() => (typeSub2 = typeSub2 === st2 ? '' : st2)}>{st2}</button>
            {/each}
          </div>
          {#if typeSub2 && subs3Now.length}
            <div class="sub-level">
              <label class="sub-label">تفصيل أخير <span class="req" style="color:var(--burgundy)">*</span> <span class="muted tiny">— تحت «{typeSub2}»</span></label>
              <div class="row wrap" style="gap:6px; {isMissing('تفصيل أخير') ? 'outline:2px solid rgba(181,73,91,0.5); outline-offset:4px; border-radius:14px' : ''}">
                {#each subs3Now as st3 (st3)}
                  <button type="button" class="chip chip-sub" class:on={typeSub3 === st3} onclick={() => (typeSub3 = typeSub3 === st3 ? '' : st3)}>{st3}</button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </div>

  <div class="field">
    <label>تصنيف الموسم * <span class="muted tiny">(اختاري وحدة أو أكثر)</span></label>
    <div class="row wrap" style="gap:8px; {isMissing('الموسم') ? 'outline:2px solid rgba(181,73,91,0.5); outline-offset:4px; border-radius:14px' : ''}">
      {#each opts.seasons as s (s)}
        <button type="button" class="chip" class:on={seasons.includes(s)} onclick={() => toggleSeason(s)}>{s}</button>
      {/each}
    </div>
    {#if seasons.length > 1}<p class="muted tiny" style="margin:4px 2px 0"> القطعة تُعرض في كل المواسم المختارة ({seasons.join('، ')})</p>{/if}
  </div>
  {/if}

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

  <div class="field">
    <label>المورد <span class="req" style="color:var(--burgundy)">*</span> <span class="muted tiny">(منين شريتِ؟)</span></label>
    {#if suppliers.length}
      <Pick bind:value={supplier} placeholder="اختاري المورد…" options={suppliers} invalid={isMissing('المورد')} />
    {:else}
      <input class="input" bind:value={supplier} style={bad('المورد')} placeholder="مثال: هاي مول — أبو علي" />
      <p class="muted tiny" style="margin:4px 2px 0">سجّلي مورديك من الإعدادات لتظهروا قائمة هنا.</p>
    {/if}
  </div>

  <div class="field">
    <label>وقت الوصول للرف <span class="muted tiny">(بتوقيت بغداد)</span></label>
    <div class="row" style="gap:8px; align-items:center">
      <input
        class="input ts-input"
        type="datetime-local"
        bind:value={ts}
        onchange={onTsChange}
        max={baghdadLocalInput()}
      />
      <button type="button" class="chip" class:on={tsIsNow} onclick={tsToNow}>الآن</button>
    </div>
    <p class="muted tiny" style="margin:4px 2px 0">البضاعة وصلت من قبل؟ عدّلي الوقت — الرکود وترتيب الأحدث والتقارير كلها تحسب منه.</p>
  </div>

  <div class="row" style="gap:10px">
    <div class="field" style="flex:1">
      <label>سعر التكلفة (د.ع) *</label>
      <input class="input" style={bad('التكلفة')} bind:value={cost} inputmode="decimal" placeholder="0" />
    </div>
    <div class="field" style="flex:1">
      <label>سعر البيع (د.ع) *</label>
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
    <div class="miss pop">مطلوب قبل الحفظ: {missing.join(' - ')}</div>
  {/if}

  {#if editing}
    <button class="btn danger block" onclick={zeroAllQty}>
      <Icon name="x" size={18} />
      تصفير كل الكميات — الموديل نفد
    </button>
  {/if}

  <button class="btn primary lg block" onclick={save}>
    <Icon name="check" size={20} />
    {editing
      ? `حفظ التعديلات${totalPieces > 0 ? ` — ${piecesWord(totalPieces)}` : ''}`
      : totalPieces > 0
        ? `حفظ ${piecesWord(totalPieces)}${saveSummary ? ` — ${saveSummary}` : ''}`
        : 'إضافة الموديل'}
  </button>
</div>

<PhotoSourceSheet open={photoSrcOpen} onclose={() => (photoSrcOpen = false)} onpick={pickPhotoSource} />

<style>

  .photo-tile.need { border-color: rgba(181, 73, 91, 0.6); box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.1); }
  .photo-wrap { position: relative; display: inline-flex; }
  /* الصورة بالمنتصف وأوسع — تشوفين الحذاء بوضوح */
  .photo-field { align-items: center; display: flex; flex-direction: column; gap: 6px; }
  .photo-field .photo-wrap { margin-inline: auto; }
  .photo-tile {
    width: 148px; height: 148px;
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
  .ph-txt { font-size: 12px; font-weight: 800; color: var(--taupe); }
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
  /* حقل التاريخ يُقرأ بالإنجليزية دائماً — اتجاهه لا ينقلب مع الواجهة */
  .ts-input { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; }
  /* شجرة النوع: خيط ذهبي يربط التفاصيل بنوعها الأم — التسلسل مرئي */
  .type-group {
    padding-inline-start: 14px;
    border-inline-start: 2px solid rgba(201, 161, 90, 0.5);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sub-level { display: flex; flex-direction: column; gap: 6px; }
  .sub-label { font-size: 12px; color: var(--ink-2); }
  .chip-sub { font-size: 12px; padding: 5px 12px; opacity: 0.92; }
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
  /* بطاقة «وصول دفعة لموديل موجود» */
  :global(.batch-card) { padding: 0; overflow: hidden; }
  .batch-top {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: none;
    border: none;
    text-align: right;
    cursor: pointer;
    color: var(--ink);
  }
  .batch-ic {
    flex: none;
    width: 34px; height: 34px;
    border-radius: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--gold-soft, rgba(201, 162, 75, 0.14));
  }
  .batch-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .batch-t { font-size: 13px; font-weight: 800; color: var(--burgundy-deep); }
  .chev { flex: none; display: inline-flex; transition: transform 0.25s; color: var(--taupe); }
  .chev.flip { transform: rotate(-90deg); }
  .batch-body {
    padding: 0 14px 13px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .batch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
  }
  .batch-mod {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: var(--glass, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    text-align: center;
  }
  .batch-mod.on { border-color: var(--burgundy); background: var(--gold-soft, rgba(201, 162, 75, 0.14)); }
  .bm-img {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 9px;
    background: var(--ivory, #FBF3EE);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .bm-img img { width: 100%; height: 100%; object-fit: cover; }
  .bm-cap { font-size: 11px; font-weight: 700; color: var(--ink); line-height: 1.25; max-height: 2.5em; overflow: hidden; }
  .bm-qty { font-size: 10px; color: var(--taupe); }
  .batch-note {
    margin: 0;
    font-size: 11px;
    line-height: 1.55;
    color: var(--burgundy-deep);
    background: var(--gold-soft, rgba(201, 162, 75, 0.12));
    border-radius: 10px;
    padding: 8px 10px;
  }
</style>
