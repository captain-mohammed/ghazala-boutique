<script>
  /* استوديو التسويق — الحملات + قائمة الانتظار في شاشة واحدة.
     كل شيء يُبنى من بيانات موجودة: الزبونات من المبيعات، الانتظار من النفد،
     والرسائل من قوالب الإعدادات (تُقرأ حيّة عند كل إرسال).
     المسير: افتحي واتساب لزبونة → تقدم تلقائي للتالية حتى آخر القائمة. */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import Pick from '../components/Pick.svelte';
  import { db, getSetting, addWaitlistEntry } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz, sendWhatsApp, renderTpl, MKT_TEMPLATES } from '../utils.js';
  import { toastOk, toastErr, campaignContacts } from '../store.js';

  let { goto } = $props();

  let tab = $state('camp'); // camp | wait
  let customers = $state([]);
  let products = $state([]);
  let waits = $state([]);
  let tpls = $state({ firstdibs: '', waiting: '', rescue: '', quiet: '' });
  let loading = $state(true);

  async function load() {
    loading = true;
    const [sales, prods, wl, t1, t2, t3, t4] = await Promise.all([
      db.sales.toArray(),
      db.products.toArray(),
      db.waitlists.toArray(),
      getSetting(MKT_TEMPLATES.firstdibs.key, ''),
      getSetting(MKT_TEMPLATES.waiting.key, ''),
      getSetting(MKT_TEMPLATES.rescue.key, ''),
      getSetting(MKT_TEMPLATES.quiet.key, '')
    ]);
    products = prods;
    salesCache = sales;
    waits = wl.filter((w) => w.status === 'waiting');
    tpls = {
      firstdibs: t1 || MKT_TEMPLATES.firstdibs.def,
      waiting: t2 || MKT_TEMPLATES.waiting.def,
      rescue: t3 || MKT_TEMPLATES.rescue.def,
      quiet: t4 || MKT_TEMPLATES.quiet.def
    };
    /* دفتر مبسّط: كل زبونة بإجمالياتها — نفس منطق دفتر الزبونات */
    const map = new Map();
    const touch = (n, p) => {
      if (!(n || '').trim() && !(p || '').trim()) return null;
      const k = `${(n || '').trim()}|${(p || '').trim()}`;
      if (!map.has(k)) map.set(k, { name: (n || '').trim() || 'زبونة', phone: (p || '').trim(), spent: 0, orders: 0, last: null });
      return map.get(k);
    };
    for (const s of sales) {
      if (s.status === 'returned') continue;
      const c = touch(s.customerName, s.customerPhone);
      if (!c) continue;
      c.spent += s.subtotal || 0;
      c.orders += 1;
      if (!c.last || new Date(s.date) > new Date(c.last)) c.last = s.date;
    }
    customers = [...map.values()]
      .map((c) => ({
        ...c,
        vip: c.spent >= 150000 || c.orders >= 3,
        daysSince: c.last ? Math.floor((Date.now() - new Date(c.last).getTime()) / 86400000) : null
      }))
      .sort((a, b) => b.spent - a.spent);
    loading = false;
    /* مقبول من شاشة أخرى (توريد وصل / إنقاذ راكد)؟ افتحي عليه جاهزاً */
    const cc = get(campaignContacts);
    if (cc) { campaignContacts.set(null); applyCC(cc); }
  }
  onMount(load);

  /* ---------- الحملات ---------- */
  let kind = $state(null);        // firstdibs | quiet | vip | rescue
  let model = $state(null);       // { modelId, chain, sizes, price }
  let sel = $state([]);           // [{ name, phone }]
  let modelPickOpen = $state(false);
  let typePickOpen = $state(false);
  let pickType = $state('');
  let walkOpen = $state(false);
  let wi = $state(0);             // مؤشر المسير
  let drafts = $state({});        // نص جاهز لكل زبونة — قابل للتحرير قبل الفتح
  let sentCount = $state(0);
  let salesCache = [];

  const vipList = $derived(customers.filter((c) => c.vip));
  const quietList = $derived(customers.filter((c) => c.daysSince !== null && c.daysSince >= 21));

  const models = $derived.by(() => {
    const map = new Map();
    for (const p of products) {
      if (!map.has(p.modelId)) map.set(p.modelId, { modelId: p.modelId, chain: '', colors: [], sizes: [], allColors: [], allSizes: [], price: 0, qty: 0 });
      const m = map.get(p.modelId);
      const chain = [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ');
      if (chain && !m.chain) m.chain = chain;
      if (p.price > m.price) m.price = p.price;
      m.qty += p.qty || 0;
      /* colors/sizes = المتوفر فقط (للحملات) — allColors/allSizes = كل ما طرأ للموديل
         (لقائمة الانتظار: الانتظار بالضبط على المنفود) */
      if (p.qty > 0 && p.color && !m.colors.includes(p.color)) m.colors.push(p.color);
      if (p.qty > 0 && p.size && !m.sizes.includes(String(p.size))) m.sizes.push(String(p.size));
      if (p.color && !m.allColors.includes(p.color)) m.allColors.push(p.color);
      if (p.size && !m.allSizes.includes(String(p.size))) m.allSizes.push(String(p.size));
    }
    return [...map.values()];
  });
  const mSizes = (m) => (m?.sizes?.length ? [...m.sizes].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)).join('، ') : '—');
  const mColors = (m) => (m?.colors?.length ? m.colors.join('، ') : '—');
  const modelById = $derived(new Map(models.map((m) => [m.modelId, m])));
  const typeChains = $derived([...new Set(products.map((p) => [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ')).filter(Boolean))]);

  /* من اشترت نوعاً معيناً؟ — sku → سلسلة النوع ثم مطابقة سجلات البيع */
  function buyersOf(chain) {
    const skuType = new Map(products.map((p) => [p.sku, [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ')]));
    const hit = new Set();
    for (const s of salesCache) {
      if (s.status === 'returned') continue;
      for (const it of s.items || []) {
        if (skuType.get(it.sku) === chain) hit.add(`${(s.customerName || '').trim()}|${(s.customerPhone || '').trim()}`);
      }
    }
    return customers.filter((c) => hit.has(`${c.name}|${c.phone}`));
  }

  function startChain(k) {
    buzz(8);
    kind = k;
    model = null;
    pickType = '';
    if (k === 'firstdibs') { sel = []; modelPickOpen = true; }
    else if (k === 'quiet') sel = quietList.map((c) => ({ name: c.name, phone: c.phone }));
    else if (k === 'vip') sel = vipList.map((c) => ({ name: c.name, phone: c.phone }));
    else if (k === 'rescue') { sel = []; typePickOpen = true; }
  }
  function onModelPicked(mid) {
    modelPickOpen = false;
    const m = modelById.get(mid);
    if (!m) return;
    model = { modelId: m.modelId, chain: m.chain || 'موديل جديد', colors: mColors(m), sizes: mSizes(m), price: m.price };
    sel = vipList.map((c) => ({ name: c.name, phone: c.phone })); /* قبل الجميع = كبار الزبونات أولاً */
  }
  function onTypePicked(chain) {
    typePickOpen = false;
    pickType = chain;
    sel = buyersOf(chain).map((c) => ({ name: c.name, phone: c.phone }));
    /* أقدم موديل راكد من هذا النوع هو نجم الحملة */
    let oldest = null;
    for (const p of products) {
      const pc = [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ');
      const m = modelById.get(p.modelId);
      if (pc !== chain || !m || m.qty <= 0) continue;
      if (!oldest || new Date(p.createdAt) < new Date(oldest.createdAt)) oldest = p;
    }
    if (oldest) {
      const m = modelById.get(oldest.modelId);
      model = { modelId: m.modelId, chain, colors: mColors(m), sizes: mSizes(m), price: m.price };
    }
  }
  const tplFor = $derived(kind === 'vip' ? tpls.quiet : tpls[kind] || '');
  const ck = (c) => `${c.name}|${c.phone}`;
  function msgFor(c) {
    return renderTpl(tplFor, {
      '{name}': c.name,
      '{model}': model?.chain || '—',
      '{colors}': model?.colors || '—',
      '{sizes}': model?.sizes || '—',
      '{price}': model?.price ? fmtIQD(model.price) : '—',
      '{shop}': 'بوتيك غزالة'
    });
  }
  function openWalk() {
    if (!sel.length) return toastErr('اختاري زبونة واحدة على الأقل');
    drafts = Object.fromEntries(sel.map((c) => [ck(c), msgFor(c)]));
    wi = 0; sentCount = 0; walkOpen = true;
  }
  async function waCurrent() {
    const c = sel[wi];
    if (!c) return;
    const { opened } = await sendWhatsApp(drafts[ck(c)] ?? msgFor(c), c.phone);
    if (opened) sentCount += 1;
    if (wi < sel.length - 1) wi += 1;
    else { walkOpen = false; toastOk(`خلصتِ القائمة — فتحتِ واتساب ${fmtNum(sentCount)} مرة 💛`); }
  }
  function skipCurrent() { if (wi < sel.length - 1) wi += 1; else walkOpen = false; }

  /* ---------- قائمة الانتظار ---------- */
  let capOpen = $state(false);
  let capName = $state('');
  let capPhone = $state('');
  let capColor = $state('');
  let capSize = $state('');
  let capModelId = $state('');
  let capColors = $state([]);
  let capSizes = $state([]);

  function openCap(mid) {
    const m = modelById.get(mid);
    if (!m) return;
    capModelId = mid; capName = ''; capPhone = '';
    /* قائمة الانتظار تعرض كل ألوان ومقاسات الموديل — حتى المنفودة،
       فالانتظار بالضبط على ما لا يوجد الآن */
    capColors = (m.allColors?.length ? [...m.allColors] : m.colors?.length ? [...m.colors] : []).sort((a, b) => a.localeCompare(b, 'ar'));
    capSizes = (m.allSizes?.length ? [...m.allSizes] : m.sizes?.length ? [...m.sizes] : []).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    capColor = capColors[0] || '';
    capSize = capSizes[0] || '';
    capOpen = true;
  }
  async function saveCap() {
    if (!capName.trim() && !capPhone.trim()) return toastErr('الاسم أو الرقم مطلوب');
    const r = await addWaitlistEntry({ customerName: capName, customerPhone: capPhone, modelId: capModelId, sku: '', size: capSize, color: capColor });
    if (!r.ok) return toastErr(r.dup ? 'هي موجودة بالانتظار أصلاً' : 'تعذر الحفظ');
    capOpen = false;
    toastOk('ضامنتِ قائمة الانتظار — ينادى عليها عند التوريد 🌷');
    await load();
  }
  /* زر «وصل انتظارك» — حملة جاهزة على منتظرة واحدة بنص القالب */
  function waWaiting(w) {
    const m = modelById.get(w.modelId);
    kind = 'waiting';
    model = { modelId: w.modelId, chain: m?.chain || '—', colors: w.color || mColors(m), sizes: w.size || mSizes(m), price: m?.price || 0 };
    sel = [{ name: w.customerName, phone: w.customerPhone }];
    openWalk();
  }
  async function dropWait(key) {
    await db.waitlists.delete(key);
    await load();
  }

  /* وصول توريد → زبونات جاهزات من ReceiveInvoice */
  function applyCC(cc) {
    tab = 'camp';
    kind = cc.kind || 'firstdibs';
    model = cc.model || null;
    sel = (cc.contacts || []).map((c) => ({ name: c.name, phone: c.phone }));
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="hero rise" style="padding:16px">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div>
        <h1 class="h1">استوديو التسويق</h1>
        <div class="muted small">{fmtNum(customers.length)} زبونة — رسائل تُصاغ لكل واحدة بإسمها</div>
      </div>
      <span class="hero-ic"><Icon name="sparkle" size={22} color="var(--burgundy)" /></span>
    </div>
    <div class="seg">
      <button class="seg-b" class:on={tab === 'camp'} onclick={() => { tab = 'camp'; buzz(6); }}>الحملات</button>
      <button class="seg-b" class:on={tab === 'wait'} onclick={() => { tab = 'wait'; buzz(6); }}>
        قائمة الانتظار{waits.length ? ` (${fmtNum(waits.length)})` : ''}
      </button>
    </div>
  </Glass>

  {#if loading}
    <div class="muted small" style="text-align:center; padding:30px">…جاري التجهيز</div>
  {:else if tab === 'camp'}
    {#if !customers.length}
      <EmptyState title="لا زبونات بعد" body="أول عملية بيع تبني الدفتر — وبعدها تفتح لك الحملات تلقائياً" icon="sparkle" />
    {:else}
      <div class="grid2">
        <Glass class="rise ch" style="padding:14px"><button class="ch-b" onclick={() => startChain('firstdibs')}>
          <span class="ch-ic" style="background:rgba(212,175,55,.16)"><Icon name="flame" size={19} color="#8a6d1a" /></span>
          <b>قبل الجميع</b><span class="muted tiny">موديل وصل — كبار الزبونات أول من يعرف</span>
        </button></Glass>
        <Glass class="rise ch" style="padding:14px; animation-delay:.04s"><button class="ch-b" onclick={() => startChain('quiet')}>
          <span class="ch-ic" style="background:rgba(156,123,107,.16)"><Icon name="moon" size={19} color="var(--taupe)" /></span>
          <b>اشتقت لك</b><span class="muted tiny">{fmtNum(quietList.length)} غايبة 21+ يوم</span>
        </button></Glass>
        <Glass class="rise ch" style="padding:14px; animation-delay:.08s"><button class="ch-b" onclick={() => startChain('vip')}>
          <span class="ch-ic" style="background:rgba(181,73,91,.12)"><Icon name="flame" size={19} color="var(--burgundy)" /></span>
          <b>حبيبات الدرج</b><span class="muted tiny">{fmtNum(vipList.length)} من الدرجة الأولى</span>
        </button></Glass>
        <Glass class="rise ch" style="padding:14px; animation-delay:.12s"><button class="ch-b" onclick={() => startChain('rescue')}>
          <span class="ch-ic" style="background:rgba(230,145,56,.16)"><Icon name="undo" size={19} color="#9a5b16" /></span>
          <b>إنقاذ راكد</b><span class="muted tiny">عرض خاص لمشتريات نفس النوع</span>
        </button></Glass>
      </div>

      {#if kind}
        <Glass class="rise" style="padding:14px">
          <div class="row" style="justify-content:space-between; align-items:center; margin-bottom:8px">
            <b class="small">{kind === 'firstdibs' ? '📣 قبل الجميع' : kind === 'quiet' ? '🌙 اشتقت لك' : kind === 'vip' ? '⭐ حبيبات الدرج' : '🎁 إنقاذ راكد'}</b>
            <button class="iconbtn" aria-label="إغلاق" onclick={() => { kind = null; sel = []; model = null; }}><Icon name="x" size={14} /></button>
          </div>
          {#if model}
            <div class="muted tiny">
              {#if kind === 'rescue'}النوع: <b class="ink">{pickType}</b> —{/if}
              الموديل: <b class="ink">{model.chain}</b> — الألوان: {model.colors} — المقاسات: {model.sizes} — {fmtIQD(model.price)}
            </div>
          {:else if kind === 'rescue'}
            <div class="muted tiny">اختاري النوع لتبدأ الحملة…</div>
          {/if}
          <div class="row" style="gap:6px; align-items:center; margin-top:9px; flex-wrap:wrap">
            <span class="muted tiny bold">المستلمات:</span>
            <button class="mini" class:on={sel.length === customers.length && customers.length > 0} onclick={() => (sel = customers.map((c) => ({ name: c.name, phone: c.phone })))}>الكل {fmtNum(customers.length)}</button>
            <button class="mini" class:on={sel.length === vipList.length && vipList.length > 0} onclick={() => (sel = vipList.map((c) => ({ name: c.name, phone: c.phone })))}>VIP {fmtNum(vipList.length)}</button>
            <button class="mini" class:on={sel.length === quietList.length && quietList.length > 0} onclick={() => (sel = quietList.map((c) => ({ name: c.name, phone: c.phone })))}>الغايبات {fmtNum(quietList.length)}</button>
          </div>
          <div class="pickrow">
            {#each sel as c (ck(c))}
              <button class="chip-p" onclick={() => (sel = sel.filter((x) => ck(x) !== ck(c)))}>{c.name} <Icon name="x" size={9} /></button>
            {/each}
            {#if !sel.length}<span class="muted tiny">ما اختيار بعد</span>{/if}
          </div>
          <button class="btn gold block" style="margin-top:10px; min-height:44px" onclick={openWalk}>
            <Icon name="whatsapp" size={16} /> افتحي واتساب للجميع ({fmtNum(sel.length)})
          </button>
        </Glass>
      {/if}
    {/if}
  {:else}
    {#if !models.length}
      <EmptyState title="لا موديلات بعد" body="سجلي موديلاتك أولاً — وبعدها سجلي منتظرات المقاسات النافدة" icon="box" />
    {:else}
      <Glass class="rise" style="padding:13px 14px">
        <b class="small">سجلي زبونة على مقاس نافد</b>
        <div class="muted tiny" style="margin-top:3px">اختاري الموديل، ثم اسمها ومقاسها — ينادى عليها تلقائياً عند التوريد</div>
        <div class="cap-pick">
          <Pick bind:value={capModelId} options={models.map((m) => ({ value: m.modelId, label: m.chain || m.modelId }))} placeholder="اختاري الموديل…" />
        </div>
        {#if capModelId}
          <button class="btn gold block" style="margin-top:8px; min-height:42px" onclick={() => openCap(capModelId)}>
            <Icon name="plus" size={15} /> سجليها على «{modelById.get(capModelId)?.chain}»
          </button>
        {/if}
      </Glass>

      {#if !waits.length}
        <EmptyState title="القائمة فاضية" body="أول زبونة تسأل عن مقاس نافد — سجليها هنا وتحول النفد لبيع مؤكد" icon="clock" />
      {:else}
        {#each waits as w, i (w.key)}
          <Glass class="rise" style="padding:12px 14px; animation-delay:{Math.min(i * 0.04, 0.3)}s">
            <div class="row" style="justify-content:space-between; align-items:center">
              <div>
                <b class="small">{w.customerName}</b>
                {#if w.color}<span class="badge-rose">{w.color}</span>{/if}
                {#if w.size}<span class="badge-rose">مقاس {w.size}</span>{/if}
                <div class="muted tiny">{modelById.get(w.modelId)?.chain || '—'} — منذ {fmtDate(w.createdAt)}</div>
              </div>
              <div class="row" style="gap:6px">
                <button class="g-wa" onclick={() => waWaiting(w)}><Icon name="whatsapp" size={12} /> وصل انتظارك</button>
                <button class="iconbtn" aria-label="حذف" onclick={() => dropWait(w.key)}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          </Glass>
        {/each}
      {/if}
    {/if}
  {/if}
</div>

<!-- مسير الإرسال: زبونة زبونة، نص قابل للتعديل قبل كل فتح -->
<Sheet open={walkOpen} title="فتح واتساب" onclose={() => (walkOpen = false)}>
  {#if sel[wi]}
    <div class="stack" style="gap:12px">
      <Glass style="padding:14px">
        <div class="row" style="justify-content:space-between; align-items:center">
          <b>{sel[wi].name}</b>
          <span class="muted tiny">{fmtNum(wi + 1)} من {fmtNum(sel.length)}</span>
        </div>
        <div class="bar"><i style="width:{(wi / Math.max(sel.length, 1)) * 100}%"></i></div>
        <textarea class="msg" rows="9" bind:value={drafts[ck(sel[wi])]}></textarea>
      </Glass>
      <button class="btn gold block" style="min-height:46px" onclick={waCurrent}>
        <Icon name="whatsapp" size={16} /> فتحي واتساب وأرسلي
      </button>
      <div class="row" style="gap:8px">
        <button class="btn ghost block" style="min-height:40px" onclick={skipCurrent}>تخطيها</button>
        <button class="btn ghost block" style="min-height:40px" onclick={() => (walkOpen = false)}>إيقاف</button>
      </div>
    </div>
  {/if}
</Sheet>

<!-- التقاط الانتظار -->
<Sheet open={capOpen} title="قائمة الانتظار" onclose={() => (capOpen = false)}>
  <div class="stack" style="gap:10px">
    <label class="lab" for="wl-name">اسم الزبونة *</label>
    <input id="wl-name" class="input" bind:value={capName} placeholder="مثال: زينب" />
    <label class="lab" for="wl-phone">رقم الواتساب</label>
    <input id="wl-phone" class="input" bind:value={capPhone} dir="ltr" inputmode="tel" placeholder="07XX XXX XXXX" style="text-align:right" />
    {#if capColors.length}
      <label class="lab">اللون المنتظر</label>
      <Pick bind:value={capColor} options={capColors.map((c) => ({ value: c, label: c }))} />
    {/if}
    {#if capSizes.length}
      <label class="lab">المقاس المنتظر</label>
      <Pick bind:value={capSize} options={capSizes.map((s) => ({ value: s, label: s }))} />
    {/if}
    <button class="btn gold block" style="min-height:44px" onclick={saveCap}><Icon name="check" size={15} /> سجليها</button>
  </div>
</Sheet>

{#if modelPickOpen}
  <Sheet open title="اختاري الموديل" onclose={() => (modelPickOpen = false)}>
    <div class="stack" style="gap:8px">
      {#each models.filter((m) => m.qty > 0).slice(0, 40) as m (m.modelId)}
        <button class="mpick" onclick={() => onModelPicked(m.modelId)}>
          <span class="mchain">{m.chain || m.modelId}</span>
          <span class="muted tiny">{mColors(m) !== '—' ? `ألوان: ${mColors(m)} — ` : ''}{m.sizes.length ? `مقاسات: ${mSizes(m)}` : 'بلا مقاسات'} — {fmtIQD(m.price)}</span>
        </button>
      {:else}
        <div class="muted small">كل الموديلات نافدة — استقبلي توريد أولاً</div>
      {/each}
    </div>
  </Sheet>
{/if}

{#if typePickOpen}
  <Sheet open title="إنقاذ راكد — اختاري النوع" onclose={() => { typePickOpen = false; if (!model) kind = null; }}>
    <div class="stack" style="gap:8px">
      {#each typeChains as tc (tc)}
        <button class="mpick" onclick={() => onTypePicked(tc)}><span class="mchain">{tc}</span></button>
      {/each}
    </div>
  </Sheet>
{/if}

<style>
  .hero-ic {
    width: 44px; height: 44px; border-radius: 14px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1); border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .seg { display: flex; gap: 6px; margin-top: 12px; background: rgba(255, 255, 255, 0.5); border: 1px solid var(--line-2); border-radius: 12px; padding: 4px; }
  .seg-b { flex: 1; border: none; background: none; font-family: inherit; font-weight: 800; font-size: 12px; color: var(--taupe); padding: 8px 6px; border-radius: 9px; cursor: pointer; }
  .seg-b.on { background: var(--burgundy); color: #fff; box-shadow: 0 2px 8px rgba(181, 73, 91, 0.3); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ch-b { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; text-align: right; }
  .ch-b b { font-size: 13.5px; color: var(--ink); }
  .ch-ic { width: 38px; height: 38px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
  .mini { border: 1px solid var(--line-2); background: rgba(255, 255, 255, 0.55); color: var(--ink-2); font-family: inherit; font-weight: 800; font-size: 11px; border-radius: 999px; padding: 5px 11px; cursor: pointer; }
  .mini.on { background: var(--burgundy); color: #fff; border-color: var(--burgundy); }
  .pickrow { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .chip-p { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(181, 73, 91, 0.3); background: rgba(181, 73, 91, 0.08); color: var(--burgundy); font-family: inherit; font-weight: 700; font-size: 11px; border-radius: 999px; padding: 4px 9px; cursor: pointer; }
  .bar { height: 5px; border-radius: 999px; background: var(--line-2); margin-top: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--gold), var(--burgundy)); border-radius: 999px; transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1); }
  .msg { width: 100%; border: 1px dashed var(--line-2); border-radius: 12px; background: rgba(255, 255, 255, 0.6); font-family: inherit; font-size: 13px; color: var(--ink); padding: 10px; resize: vertical; }
  .lab { font-size: 12px; font-weight: 800; color: var(--ink-2); }
  .mpick { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; background: rgba(255, 255, 255, 0.55); border: 1px solid var(--line-2); border-radius: 12px; padding: 10px 12px; cursor: pointer; font-family: inherit; text-align: right; }
  .mpick:active { transform: scale(0.98); }
  .mchain { font-weight: 800; font-size: 13px; color: var(--ink); }
  .badge-rose { color: var(--burgundy); background: rgba(181, 73, 91, 0.12); font-size: 9.5px; font-weight: 800; padding: 2px 7px; border-radius: 999px; margin-inline-start: 6px; }
  .ink { color: var(--ink); }
  .cap-pick { margin-top: 8px; }
  .g-wa {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: inherit; font-size: 10.5px; font-weight: 800; color: #1f7a44;
    background: rgba(37, 211, 102, 0.14); border: none; border-radius: 999px;
    padding: 5px 10px; cursor: pointer;
  }
  .g-wa:active { transform: scale(0.95); }
</style>
