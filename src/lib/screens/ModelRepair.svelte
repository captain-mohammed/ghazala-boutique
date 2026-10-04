<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, findMergedModels, splitModel, findSimilarModels, joinModels } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  /* أداة صيانة هوية الموديلات — وجهان:
     ١) بطاقات دُمجت خطأً تحت رقم موديل واحد → نفصلها.
     ٢) موديلات متشابهة بأرقام مختلفة → قد تكون نسخة مكرّرة، فندمجها.
     كلاهما لا يعدّل شيئاً قبل تأكيد صريح. */

  let merged = $state([]);    // بطاقات مدمجة خطأً (فصل)
  let similar = $state([]);   // موديلات متشابهة (دمج)
  let loaded = $state(false);
  let picked = $state({});    // key → [sku…]            للفصل
  let jpicked = $state({});   // nameKey → { modelId:true } للدمج
  let busy = $state(false);
  /* كل قسم قابل للطي — الحالتان مفتوحتان افتراضياً حتى لا يخفى شيء */
  let secOpen = $state({ merged: true, similar: true });
  function toggleSec(k) { secOpen = { ...secOpen, [k]: !secOpen[k] }; buzz(6); }

  /* صور الموديلات — الصورة هي هوية المنتج، وهي في جدول `photos` منذ v7
     (مرة واحدة لكل رقم موديل)، فلا تصل مع قراءة البطاقات.
     ⚠️ غير تفاعلي عن قصد: تُجلب مرة واحدة، والاستطلاع كل ٦ ثوانٍ لا يعيد
     قراءتها — وإلا صار كل نبض يجرّ ميجابايتات الصور فيتقطّع التمرير. */
  let photoMap = {};

  async function loadPhotos() {
    try {
      const rows = await db.photos.toArray();
      photoMap = Object.fromEntries(rows.map((r) => [r.modelId, r.data]));
    } catch { photoMap = {}; }
  }

  /* إلحاق الصورة بكل بطاقة (الفصل) وكل موديل (الدمج) */
  function decorate(a, b) {
    return {
      merged: a.map((g) => ({ ...g, items: g.items.map((p) => ({ ...p, photo: photoMap[g.key] || null })) })),
      similar: b.map((g) => ({ ...g, models: g.models.map((m) => ({ ...m, photo: photoMap[m.modelId] || null })) }))
    };
  }

  async function scan() {
    await loadPhotos();
    const [a, b] = await Promise.all([findMergedModels(), findSimilarModels()]);
    const d = decorate(a, b);
    merged = d.merged; similar = d.similar;
    picked = {}; jpicked = {};
    loaded = true;
  }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [a, b] = await Promise.all([findMergedModels(), findSimilarModels()]);
      const d = decorate(a, b);
      /* التحديث الدوري لا يلمس اختياراتك — يقرأ الواقع من جديد فقط */
      if (alive) { merged = d.merged; similar = d.similar; loaded = true; }
    };
    /* الصور أولاً، ثم الاستطلاع — كي تظهر الصورة من أول رسم */
    loadPhotos().then(() => { if (alive) grab(); });
    const t = setInterval(grab, 6000);
    return () => { alive = false; clearInterval(t); };
  });

  const selOf = (key) => picked[key] || [];
  const jselOf = (key) => jpicked[key] || {};

  function toggle(key, sku) {
    const cur = selOf(key);
    picked = { ...picked, [key]: cur.includes(sku) ? cur.filter((s) => s !== sku) : [...cur, sku] };
    buzz(6);
  }
  function toggleJoin(key, modelId) {
    const cur = jselOf(key);
    const next = { ...cur };
    if (next[modelId]) delete next[modelId]; else next[modelId] = true;
    jpicked = { ...jpicked, [key]: next };
    buzz(6);
  }

  /* الشواذ: البطاقات التي تختلف تكلفتها أو سعرها أو صورتها عن الأغلبية —
     عادةً البطاقات الدخيلة التي يجب فصلها */
  function outliers(g) {
    const tally = new Map();
    for (const p of g.items) {
      const k = `${p.cost || 0}|${p.price || 0}|${p.photo || ''}`;
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    let best = null, bestN = -1;
    for (const [k, n] of tally) if (n > bestN) { bestN = n; best = k; }
    return g.items.filter((p) => `${p.cost || 0}|${p.price || 0}|${p.photo || ''}` !== best);
  }
  function pickOutliers(g) {
    const out = outliers(g);
    if (!out.length) { toastErr('كل البطاقات متشابهة — اختاري يدوياً'); return; }
    picked = { ...picked, [g.key]: out.map((p) => p.sku) };
    buzz(10);
  }

  const dayOf = (ts) => {
    const d = new Date(ts);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  /* تفاصيل التعرّف على القطعة — الصورة وحدها لا تكفي حين يتشابه موديلان */
  const chainOf = (p) => [p?.type, p?.typeSub, p?.typeSub2, p?.typeSub3].filter(Boolean).join(' - ');
  const seasonOf = (p) => (Array.isArray(p?.seasons) && p.seasons.length ? p.seasons.join('، ') : (p?.season || ''));
  const metaOf = (p) => [chainOf(p), seasonOf(p), p?.material, p?.brand].filter(Boolean).join(' · ');

  async function doSplit(g) {
    const skus = selOf(g.key);
    if (!skus.length) { toastErr('اختاري البطاقات التي تريدين فصلها'); return; }
    if (skus.length >= g.items.length) {
      toastErr('لازم تبقى بطاقة واحدة على الأقل في الموديل الأصلي');
      return;
    }
    const ok = await askConfirm({
      title: 'فصل البطاقات المختارة',
      body: `تنفصل ${fmtNum(skus.length)} بطاقة إلى موديل جديد برقم جديد. المبيعات والحركات تبقى مرتبطة بأكوادها، فلا يُفقد شيء.`,
      okLabel: 'افصلي'
    });
    if (!ok) return;
    busy = true;
    try {
      const r = await splitModel(skus);
      if (r.ok) { toastOk(`انفصلت ${fmtNum(r.moved)} بطاقة إلى موديل جديد`); buzz([20, 40, 20]); await scan(); }
      else toastErr('ما قدرنا نفصل — حاولي مرة ثانية');
    } catch { toastErr('حدث خطأ أثناء الفصل'); }
    finally { busy = false; }
  }

  async function doJoin(g) {
    const ids = Object.keys(jselOf(g.nameKey));
    if (ids.length < 2) { toastErr('اختاري موديلين على الأقل للدمج'); return; }
    const chosen = g.models.filter((m) => ids.includes(m.modelId));
    const base = chosen[0]; // الأقدم — القائمة مرتبة بالأقدم أولاً
    const others = chosen.slice(1);
    const mixed = new Set(chosen.map((m) => `${m.price}|${m.photo || ''}`)).size > 1;
    const ok = await askConfirm({
      title: 'دمج الموديلات المختارة',
      body:
        `تُدمج ${fmtNum(others.length)} بطاقة/موديل داخل ${base.modelId} (الأقدم، ${dayOf(base.createdAt)}).` +
        (mixed ? '\n\n⚠️ الموديلات المختارة تختلف في الصورة أو السعر — بعد الدمج ستظهر في «بطاقات مدمجة خطأً» ويمكنك فصلها أو تعديلها.' : '') +
        '\n\nالمبيعات والحركات تبقى مرتبطة بأكوادها.',
      okLabel: 'ادمجي'
    });
    if (!ok) return;
    busy = true;
    try {
      const r = await joinModels(ids);
      if (r.ok) { toastOk(`اندمجت ${fmtNum(r.moved)} بطاقة في ${r.base}`); buzz([20, 40, 20]); await scan(); }
      else toastErr('ما قدرنا ندمج — حاولي مرة ثانية');
    } catch { toastErr('حدث خطأ أثناء الدمج'); }
    finally { busy = false; }
  }
</script>

<div class="stack" style="gap:14px">
  <Glass class="repair-hero rise">
    <div class="h-top">
      <span class="h-ic"><Icon name="alert" size={20} color="#fff" /></span>
      <div class="h-txt">
        <div class="h-title">فحص هوية الموديلات</div>
        <div class="h-sub">موديل واحد = نفس الحذاء بألوانه ومقاساته، ويحمل رقمه الخاص</div>
      </div>
    </div>
    <div class="h-stats">
      <div class="h-stat"><b class:dim={!merged.length}>{fmtNum(merged.length)}</b><span>حالة دمج</span></div>
      <div class="h-stat"><b class:dim={!similar.length}>{fmtNum(similar.length)}</b><span>مجموعة متشابهة</span></div>
    </div>
  </Glass>

  {#if !loaded}
    <Glass class="rep-pad rise"><span class="muted small">… نفحص الموديلات</span></Glass>
  {:else if !merged.length && !similar.length}
    <EmptyState
      icon="shield"
      title="كل شيء سليم"
      subtitle="لا بطاقات مدمجة خطأً ولا موديلات مكرّرة — هوية كل موديل واضحة."
    />
  {:else}
    {#if merged.length}
      <button type="button" class="sect" onclick={() => toggleSec('merged')} aria-expanded={secOpen.merged}>
        <span class="sect-ic"><Icon name="scissors" size={16} color="var(--burgundy)" /></span>
        <span class="sect-txt">
          <span class="sect-t">بطاقات مدمجة خطأً</span>
          <span class="sect-s">بطاقات تختلف في التكلفة أو السعر، أو تحمل اللون والمقاس مرتين</span>
        </span>
        <span class="sect-n">{fmtNum(merged.length)}</span>
        <span class="chev" class:open={secOpen.merged} aria-hidden="true"></span>
      </button>

      {#if secOpen.merged}
      {#each merged as g (g.key)}
        {@const sel = selOf(g.key)}
        <Glass class="rep-card rise">
          <div class="c-head">
            <span class="c-badge"><Icon name="alert" size={14} color="var(--burgundy)" /></span>
            <div style="flex:1; min-width:0">
              <div class="c-name">{g.items[0].name || 'موديل'}</div>
              <div class="muted tiny">{g.items[0].category} · {fmtNum(g.items.length)} بطاقة</div>
            </div>
            <span class="c-key">{g.key.startsWith('M-') ? g.key : 'بلا رقم'}</span>
          </div>

          <div class="why">
            {#each g.reasons as r (r)}<span class="why-chip">{r}</span>{/each}
          </div>

          <div class="cards">
            {#each g.items as p (p.sku)}
              <button type="button" class="rp-card" class:on={sel.includes(p.sku)} onclick={() => toggle(g.key, p.sku)}>
                <span class="rp-box">
                  {#if p.photo}<img src={p.photo} alt="" />
                  {:else}<span class="pnone"><Icon name="image" size={15} color="var(--taupe)" /><i>بلا صورة</i></span>{/if}
                  {#if sel.includes(p.sku)}<span class="ptick"><Icon name="check" size={13} color="#fff" /></span>{/if}
                </span>
                <span class="pinfo">
                  <span class="prow"><b class="bold">{p.color || 'بلا لون'}</b> · مقاس {p.size || '—'} <span class="qty-chip">{fmtNum(p.qty || 0)} قطعة</span></span>
                  {#if metaOf(p)}<span class="prow muted tiny">{metaOf(p)}</span>{/if}
                  <span class="prow tiny">تكلفة {fmtIQD(p.cost)} · بيع {fmtIQD(p.price)}</span>
                  <span class="prow muted tiny">{p.sku} · وصول {dayOf(p.createdAt || p.updatedAt)}</span>
                  {#if p.supplier}<span class="prow muted tiny">المورد: {p.supplier}</span>{/if}
                </span>
              </button>
            {/each}
          </div>

          <div class="acts">
            <button type="button" class="btn" onclick={() => pickOutliers(g)} disabled={busy}>
              <Icon name="sparkle" size={16} /> اختاري الشواذ
            </button>
            <button type="button" class="btn primary" onclick={() => doSplit(g)} disabled={busy || !sel.length}>
              <Icon name="scissors" size={16} /> افصلي {sel.length ? fmtNum(sel.length) : ''}
            </button>
          </div>
        </Glass>
      {/each}
      {/if}
    {/if}

    {#if similar.length}
      <button type="button" class="sect" onclick={() => toggleSec('similar')} aria-expanded={secOpen.similar}>
        <span class="sect-ic"><Icon name="copy" size={16} color="var(--burgundy)" /></span>
        <span class="sect-txt">
          <span class="sect-t">موديلات متشابهة — قد تكون مكرّرة</span>
          <span class="sect-s">موديلات منفصلة بنفس النوع واللون — الأساس هو الأقدم</span>
        </span>
        <span class="sect-n">{fmtNum(similar.length)}</span>
        <span class="chev" class:open={secOpen.similar} aria-hidden="true"></span>
      </button>

      {#if secOpen.similar}
      {#each similar as g (g.nameKey)}
        {@const js = jselOf(g.nameKey)}
        {@const n = Object.keys(js).length}
        <Glass class="rep-card rise">
          <div class="c-head">
            <span class="c-badge"><Icon name="copy" size={14} color="var(--burgundy)" /></span>
            <div style="flex:1; min-width:0">
              <div class="c-name">{g.models[0].items[0].name || 'موديل'}</div>
              <div class="muted tiny">{g.models[0].items[0].category} · {fmtNum(g.models.length)} موديلات منفصلة بنفس النوع واللون</div>
            </div>
          </div>

          <div class="cards">
            {#each g.models as m, mi (m.modelId)}
              <button type="button" class="rp-card" class:on={!!js[m.modelId]} onclick={() => toggleJoin(g.nameKey, m.modelId)}>
                <span class="rp-box">
                  {#if m.photo}<img src={m.photo} alt="" />
                  {:else}<span class="pnone"><Icon name="image" size={15} color="var(--taupe)" /><i>بلا صورة</i></span>{/if}
                  {#if js[m.modelId]}<span class="ptick"><Icon name="check" size={13} color="#fff" /></span>{/if}
                </span>
                <span class="pinfo">
                  <span class="prow">
                    <b class="bold">{m.modelId}</b>
                    {#if mi === 0}<span class="oldest">الأقدم — الأساس</span>{/if}
                  </span>
                  <span class="prow">
                    <b class="bold">{m.colors.join('، ') || 'بلا لون'}</b>
                    · مقاسات {m.sizes.join('، ') || '—'}
                    <span class="qty-chip">{fmtNum(m.qty)} قطعة</span>
                  </span>
                  {#if m.type || m.seasons.length || m.material || m.supplier}
                    <span class="prow muted tiny">{[m.type, m.seasons.join('، '), m.material, m.supplier].filter(Boolean).join(' · ')}</span>
                  {/if}
                  <span class="prow tiny">تكلفة {fmtIQD(m.cost)} · بيع {fmtIQD(m.price)}</span>
                  <span class="prow muted tiny">{fmtNum(m.cardCount)} بطاقة · وصول {dayOf(m.createdAt)} · آخر تحديث {dayOf(m.lastAt)}</span>
                </span>
              </button>
            {/each}
          </div>

          <div class="acts">
            <button type="button" class="btn primary" onclick={() => doJoin(g)} disabled={busy || n < 2}>
              <Icon name="copy" size={16} /> ادمجي المختارة {n >= 2 ? `(${fmtNum(n)})` : ''}
            </button>
          </div>
        </Glass>
      {/each}
      {/if}
    {/if}
  {/if}
</div>

<style>
  /* ⚠️ أسماء خاصة بالمكوّن لا أسماء عامة: `:global(.hero)` و`:global(.card)`
     و`:global(.pad)` في Svelte **ليست محصورة بالمكوّن**، فكانت تتسرّب إلى
     «دفتر الموردين» و«المخزون» وحتى لوحة القفل — وأيّ شاشة تُفتح أخيراً
     تفوز، فيتغيّر شكل البطاقات حسب ترتيب الزيارة. */
  :global(.repair-hero) {
    padding: 14px 15px 12px;
    display: flex; flex-direction: column; gap: 12px;
    position: relative; overflow: hidden;
    background: linear-gradient(158deg, rgba(255, 255, 255, 0.94) 0%, rgba(181, 73, 91, 0.07) 62%, rgba(201, 161, 90, 0.13) 100%) !important;
    border-color: rgba(181, 73, 91, 0.18) !important;
  }
  :global(.repair-hero)::before {
    content: ''; position: absolute;
    inset-block-start: 0; inset-inline: 0; height: 2px;
    background: linear-gradient(90deg, transparent 4%, var(--gold) 50%, transparent 96%);
    opacity: 0.8;
  }
  .h-top { display: flex; align-items: center; gap: 12px; }
  .h-ic {
    flex: none; width: 46px; height: 46px; border-radius: 15px;
    display: flex; align-items: center; justify-content: center;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    box-shadow: 0 0 0 1px rgba(201, 161, 90, 0.5), 0 8px 18px rgba(122, 46, 58, 0.26);
  }
  .h-txt { flex: 1; min-width: 0; }
  .h-title { font-weight: 900; font-size: 16px; color: var(--ink); letter-spacing: 0.2px; }
  .h-sub { font-size: 11.5px; font-weight: 700; color: var(--taupe); margin-top: 2px; line-height: 1.4; }
  .h-stats {
    display: flex; align-items: stretch;
    border-top: 1px dashed rgba(201, 161, 90, 0.5);
    padding-top: 10px;
  }
  .h-stat {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    padding: 0 6px;
    border-inline-end: 1px solid var(--line);
  }
  .h-stat:last-child { border-inline-end: none; }
  .h-stat b { font-size: 15px; font-weight: 900; color: var(--burgundy-deep); font-variant-numeric: tabular-nums; }
  .h-stat b.dim { color: var(--taupe); opacity: 0.6; }
  .h-stat span { font-size: 10px; font-weight: 800; color: var(--taupe); }

  /* رأس القسم: زر كامل قابل للطي */
  .sect {
    width: 100%;
    display: flex; align-items: center; gap: 10px;
    padding: 11px 13px;
    font-family: inherit; text-align: right; cursor: pointer;
    border-radius: 18px;
    border: 1px solid rgba(181, 73, 91, 0.18);
    background: linear-gradient(140deg, rgba(255, 255, 255, 0.7), rgba(181, 73, 91, 0.06));
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sect:active { transform: scale(0.99); }
  .sect-ic {
    flex: none; width: 32px; height: 32px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-soft);
  }
  .sect-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .sect-t { font-size: 14px; font-weight: 900; color: var(--ink); }
  .sect-s { font-size: 10.5px; font-weight: 700; color: var(--taupe); line-height: 1.35; }
  .sect-n {
    flex: none;
    font-size: 11.5px; font-weight: 900; color: var(--burgundy-deep);
    background: rgba(181, 73, 91, 0.1); border-radius: 999px; padding: 3px 10px;
    font-variant-numeric: tabular-nums;
  }
  .chev {
    flex: none; width: 7px; height: 7px;
    border-inline-end: 2px solid var(--taupe); border-bottom: 2px solid var(--taupe);
    transform: rotate(-45deg); transition: transform 0.2s ease;
  }
  .chev.open { transform: rotate(45deg); }

  :global(.rep-pad) { padding: 14px 15px; }
  :global(.rep-card) { padding: 13px 14px; display: flex; flex-direction: column; gap: 11px; border-radius: 24px !important; }

  .c-head { display: flex; align-items: center; gap: 10px; }
  .c-badge {
    flex: none; width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 9px; background: var(--accent-soft);
  }
  .c-name { font-weight: 800; font-size: 14.5px; color: var(--ink); }
  .c-key {
    flex: none; font-size: 11px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.07); border-radius: 999px; padding: 4px 9px;
    font-variant-numeric: tabular-nums;
  }

  .why { display: flex; flex-wrap: wrap; gap: 6px; }
  .why-chip {
    font-size: 11px; font-weight: 800; color: var(--burgundy-deep, #7A2E3A);
    background: var(--accent-soft); border: 1px solid rgba(181, 73, 91, 0.22);
    border-radius: 999px; padding: 3px 10px;
  }

  .cards { display: flex; flex-direction: column; gap: 7px; }
  .rp-card {
    display: flex; align-items: flex-start; gap: 10px; text-align: start;
    width: 100%; cursor: pointer; font-family: inherit;
    border: 1px solid var(--line-2); border-radius: 14px;
    background: rgba(255, 255, 255, 0.45); padding: 9px 10px;
    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
  }
  .rp-card.on {
    border-color: rgba(181, 73, 91, 0.5);
    background: rgba(181, 73, 91, 0.07);
    box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.09);
  }
  .rp-box {
    position: relative; flex: none; width: 58px; height: 58px;
    border-radius: 12px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(122, 46, 58, 0.06);
  }
  .rp-box img { width: 100%; height: 100%; object-fit: cover; }
  /* بلا صورة: الصورة هي الهوية، فغيابها يجب أن يبان لا أن يمرّ صامتاً */
  .pnone {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: var(--taupe);
  }
  .pnone i { font-size: 8.5px; font-style: normal; font-weight: 800; }
  .qty-chip {
    display: inline-block; margin-inline-start: 5px;
    font-size: 10px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.07); border-radius: 999px; padding: 1px 7px;
  }
  .ptick {
    position: absolute; inset-block-start: 3px; inset-inline-end: 3px;
    width: 19px; height: 19px; border-radius: 999px;
    background: var(--burgundy); display: flex; align-items: center; justify-content: center;
  }
  .pinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .prow { font-size: 12.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .oldest {
    margin-inline-start: 6px; font-size: 10px; font-weight: 800;
    color: var(--good, #4E8A5F); background: rgba(78, 138, 95, 0.12);
    border-radius: 999px; padding: 2px 7px;
  }

  .acts { display: flex; gap: 8px; }
  .acts :global(.btn) { flex: 1; min-height: 42px; }
</style>
