<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { findMergedModels, splitModel } from '../db.js';
  import { fmtIQD, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  /* أداة صيانة: تفحص الموديلات التي يحتمل أنها دُمجت خطأً وتفصلها.
     الدليل: موديل واحد = نفس الحذاء بألوانه ومقاساته ⇒ تشترك بطاقاته في
     التكلفة وسعر البيع والصورة. اختلافها يعني أن بطاقات موديل آخر انضمت إليه. */

  let groups = $state([]);
  let loaded = $state(false);
  let picked = $state({}); // modelKey → [sku…]
  let busy = $state(false);

  /* الفحص لا يعدّل شيئاً — قراءة فقط */
  async function scan() {
    groups = await findMergedModels();
    picked = {};
    loaded = true;
  }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const g = await findMergedModels();
      /* التحديث الدوري لا يلمس اختياراتك — فقط يقرأ الواقع من جديد */
      if (alive) { groups = g; loaded = true; }
    };
    grab();
    const t = setInterval(grab, 6000);
    return () => { alive = false; clearInterval(t); };
  });

  const selOf = (key) => picked[key] || [];

  function toggle(key, sku) {
    const cur = selOf(key);
    picked = { ...picked, [key]: cur.includes(sku) ? cur.filter((s) => s !== sku) : [...cur, sku] };
    buzz(6);
  }

  /* الشواذ: البطاقات التي تختلف تكلفتها أو سعرها أو صورتها عن الأغلبية —
     هذه عادةً البطاقات الدخيلة التي يجب فصلها */
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
      okLabel: 'افصلي',
      danger: false
    });
    if (!ok) return;
    busy = true;
    try {
      const r = await splitModel(skus);
      if (r.ok) {
        toastOk(`انفصلت ${fmtNum(r.moved)} بطاقة إلى موديل جديد ${r.modelId}`);
        buzz([20, 40, 20]);
        await scan();
      } else {
        toastErr('ما قدرنا نفصل — حاولي مرة ثانية');
      }
    } catch {
      toastErr('حدث خطأ أثناء الفصل');
    } finally {
      busy = false;
    }
  }
</script>

<div class="stack" style="gap:14px">
  <Glass class="hero rise">
    <div class="h-top">
      <span class="h-ic"><Icon name="alert" size={20} color="var(--burgundy)" /></span>
      <div style="flex:1">
        <div class="h-title">فحص الموديلات المدمجة</div>
        <p class="muted small" style="margin:3px 0 0">
          موديل واحد = نفس الحذاء بألوانه ومقاساته، فتتفق بطاقاته في التكلفة والسعر والصورة.
          هذا الفحص يعرض الموديلات التي تختلف بطاقاتها — علامة على أن بطاقات موديل آخر انضمت إليها.
        </p>
      </div>
    </div>
  </Glass>

  {#if !loaded}
    <Glass class="pad rise">
      <span class="muted small">… نفحص الموديلات</span>
    </Glass>
  {:else if !groups.length}
    <EmptyState
      icon="shield"
      title="ما لقينا أي دمج"
      subtitle="كل الموديلات سليمة — بطاقات كل موديل تتفق في التكلفة والسعر والصورة."
    />
  {:else}
    <Glass class="note rise">
      <span class="muted small">
        لقينا <b class="bold">{fmtNum(groups.length)}</b> موديل يحتاج مراجعة. اختاري البطاقات
        الدخيلة ثم افصليها — لا يتغيّر أي شيء قبل ضغط «افصلي».
      </span>
    </Glass>

    {#each groups as g (g.key)}
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
            <button
              type="button"
              class="pcard"
              class:on={sel.includes(p.sku)}
              onclick={() => toggle(g.key, p.sku)}
            >
              <span class="pbox">
                {#if p.photo}
                  <img src={p.photo} alt="" />
                {:else}
                  <Icon name="image" size={16} color="var(--taupe)" />
                {/if}
                {#if sel.includes(p.sku)}
                  <span class="ptick"><Icon name="check" size={13} color="#fff" /></span>
                {/if}
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
          <button
            type="button"
            class="btn primary"
            onclick={() => doSplit(g)}
            disabled={busy || !sel.length}
          >
            <Icon name="scissors" size={16} /> افصلي {sel.length ? fmtNum(sel.length) : ''}
          </button>
        </div>
      </Glass>
    {/each}
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

  .acts { display: flex; gap: 8px; }
  .acts :global(.btn) { flex: 1; min-height: 42px; }
</style>
