<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { findMergedModels, splitModel, findSimilarModels, joinModels } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  /* أداة صيانة هوية الموديلات — وجهان:
     ١) بطاقات دُمجت خطأً تحت رقم موديل واحد → نفصلها.
     ٢) موديلات متشابهة بأرقام مختلفة → قد تكون نسخة مكرّرة، فندمجها.
     كلاهما لا يعدّل شيئاً قبل تأكيد صريح. */

  let merged = $state([]);    // بطاقات مدمجة خطأً (فصل)
  let similar = $state([]);   // موديلات متشابهة (دمج)
  let loaded = $state(false);
  let picked = $state({});    // nameKey → [sku…]        للفصل
  let jpicked = $state({});   // nameKey → [modelId…]    للدمج
  let busy = $state(false);

  async function scan() {
    const [a, b] = await Promise.all([findMergedModels(), findSimilarModels()]);
    merged = a; similar = b;
    picked = {}; jpicked = {};
    loaded = true;
  }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [a, b] = await Promise.all([findMergedModels(), findSimilarModels()]);
      /* التحديث الدوري لا يلمس اختياراتك — يقرأ الواقع من جديد فقط */
      if (alive) { merged = a; similar = b; loaded = true; }
    };
    grab();
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
  <Glass class="hero rise">
    <div class="h-top">
      <span class="h-ic"><Icon name="alert" size={20} color="var(--burgundy)" /></span>
      <div style="flex:1">
        <div class="h-title">فحص هوية الموديلات</div>
        <p class="muted small" style="margin:3px 0 0">
          موديل واحد = نفس الحذاء بألوانه ومقاساته، فتتفق بطاقاته في التكلفة والسعر والصورة،
          ويحمل رقمه الخاص. هنا نفحص الحالتين المعكوستين: بطاقات انضمّت لموديل غريب،
          وموديلات متشابهة قد تكون نسخة مكرّرة.
        </p>
      </div>
    </div>
  </Glass>

  {#if !loaded}
    <Glass class="pad rise"><span class="muted small">… نفحص الموديلات</span></Glass>
  {:else if !merged.length && !similar.length}
    <EmptyState
      icon="shield"
      title="كل شيء سليم"
      subtitle="لا بطاقات مدمجة خطأً ولا موديلات مكرّرة — هوية كل موديل واضحة."
    />
  {:else}
    {#if merged.length}
      <div class="sect">
        <Icon name="scissors" size={16} color="var(--burgundy)" />
        <span>بطاقات مدمجة خطأً</span>
        <span class="sect-n">{fmtNum(merged.length)}</span>
      </div>
      <Glass class="note">
        <span class="muted small">
          موديلات تختلف بطاقاتها في التكلفة أو السعر أو الصورة. اختاري البطاقات الدخيلة
          ثم افصليها — لا يتغيّر أي شيء قبل ضغط «افصلي».
        </span>
      </Glass>

      {#each merged as g (g.key)}
        {@const sel = selOf(g.key)}
        <Glass class="card rise">
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
              <button type="button" class="pcard" class:on={sel.includes(p.sku)} onclick={() => toggle(g.key, p.sku)}>
                <span class="pbox">
                  {#if p.photo}<img src={p.photo} alt="" />
                  {:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}
                  {#if sel.includes(p.sku)}<span class="ptick"><Icon name="check" size={13} color="#fff" /></span>{/if}
                </span>
                <span class="pinfo">
                  <span class="prow"><b class="bold">{p.color || 'بلا لون'}</b> · مقاس {p.size || '—'}</span>
                  <span class="prow muted tiny">{p.sku} · {fmtNum(p.qty || 0)} قطعة</span>
                  <span class="prow tiny">تكلفة {fmtIQD(p.cost)} · بيع {fmtIQD(p.price)}</span>
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

    {#if similar.length}
      <div class="sect">
        <Icon name="copy" size={16} color="var(--burgundy)" />
        <span>موديلات متشابهة — قد تكون مكرّرة</span>
        <span class="sect-n">{fmtNum(similar.length)}</span>
      </div>
      <Glass class="note">
        <span class="muted small">
          موديلات منفصلة بنفس النوع واللون. إن كانت نسخة مكرّرة بالخطأ، اختاريها وادمجيها —
          الأساس هو <b class="bold">الأقدم</b>. وإن كانت مختلفة فعلاً (سعر أو صورة مغايرة)
          فاتركيها كما هي.
        </span>
      </Glass>

      {#each similar as g (g.nameKey + g.models[0].modelId)}
        {@const js = jselOf(g.nameKey)}
        {@const n = Object.keys(js).length}
        <Glass class="card rise">
          <div class="c-head">
            <span class="c-badge"><Icon name="copy" size={14} color="var(--burgundy)" /></span>
            <div style="flex:1; min-width:0">
              <div class="c-name">{g.models[0].items[0].name || 'موديل'}</div>
              <div class="muted tiny">{g.models[0].items[0].category} · {fmtNum(g.models.length)} موديلات منفصلة</div>
            </div>
          </div>

          <div class="cards">
            {#each g.models as m, mi (m.modelId)}
              <button type="button" class="pcard" class:on={!!js[m.modelId]} onclick={() => toggleJoin(g.nameKey, m.modelId)}>
                <span class="pbox">
                  {#if m.photo}<img src={m.photo} alt="" />
                  {:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}
                  {#if js[m.modelId]}<span class="ptick"><Icon name="check" size={13} color="#fff" /></span>{/if}
                </span>
                <span class="pinfo">
                  <span class="prow">
                    <b class="bold">{m.modelId}</b>
                    {#if mi === 0}<span class="oldest">الأقدم — الأساس</span>{/if}
                  </span>
                  <span class="prow muted tiny">{fmtNum(m.items.length)} بطاقة · {fmtNum(m.qty)} قطعة · {m.colors.join('، ') || 'بلا لون'}</span>
                  <span class="prow tiny">بيع {fmtIQD(m.price)} · {dayOf(m.createdAt)}</span>
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
</div>

<style>
  :global(.hero) { padding: 14px 15px; }
  .h-top { display: flex; align-items: flex-start; gap: 11px; }
  .h-ic {
    flex: none; width: 38px; height: 38px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px; background: var(--accent-soft);
  }
  .h-title { font-weight: 900; font-size: 15.5px; color: var(--ink); }

  .sect {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 4px 0;
    font-size: 14.5px; font-weight: 900; color: var(--ink);
  }
  .sect-n {
    margin-inline-start: auto;
    font-size: 11px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.07); border-radius: 999px; padding: 3px 9px;
  }

  :global(.note) { padding: 11px 13px; }
  :global(.pad) { padding: 14px 15px; }
  :global(.card) { padding: 13px 14px; display: flex; flex-direction: column; gap: 11px; }

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
  .pcard {
    display: flex; align-items: center; gap: 10px; text-align: start;
    width: 100%; cursor: pointer; font-family: inherit;
    border: 1px solid var(--line-2); border-radius: 14px;
    background: rgba(255, 255, 255, 0.45); padding: 8px 10px;
    transition: border-color 0.18s, background 0.18s, box-shadow 0.18s;
  }
  .pcard.on {
    border-color: rgba(181, 73, 91, 0.5);
    background: rgba(181, 73, 91, 0.07);
    box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.09);
  }
  .pbox {
    position: relative; flex: none; width: 46px; height: 46px;
    border-radius: 11px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(122, 46, 58, 0.06);
  }
  .pbox img { width: 100%; height: 100%; object-fit: cover; }
  .ptick {
    position: absolute; inset-block-start: 3px; inset-inline-end: 3px;
    width: 19px; height: 19px; border-radius: 999px;
    background: var(--burgundy); display: flex; align-items: center; justify-content: center;
  }
  .pinfo { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .prow { font-size: 12.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .oldest {
    margin-inline-start: 6px; font-size: 10px; font-weight: 800;
    color: var(--good, #4E8A5F); background: rgba(78, 138, 95, 0.12);
    border-radius: 999px; padding: 2px 7px;
  }

  .acts { display: flex; gap: 8px; }
  .acts :global(.btn) { flex: 1; min-height: 42px; }
</style>
