<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db, settleSale, moneyInTransit, setSetting } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz, copyText, sendWhatsApp } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  let sales = $state([]);
  let companies = $state([]);
  let newCo = $state('');
  let defaultCompany = $state('');
  let detail = $state(null); // company being viewed/settled
  let showHistory = $state(false);

  /* ---- شركات التوصيل live here now: one place for money + names ---- */
  async function addCo() {
    const name = newCo.trim();
    if (!name) return;
    if (companies.includes(name)) { toastErr('الشركة موجودة مسبقاً'); return; }
    companies = [...companies, name];
    await setSetting('deliveryCompanies', [...companies]);
    newCo = '';
    toastOk('أُضيفت شركة التوصيل');
    buzz(8);
  }
  async function rmCo(name) {
    companies = companies.filter((c) => c !== name);
    await setSetting('deliveryCompanies', [...companies]);
    toastOk('حُذفت الشركة');
    buzz(6);
  }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [s, c] = await Promise.all([db.sales.toArray(), db.settings.get('deliveryCompanies')]);
      if (!alive) return;
      sales = s;
      companies = c?.value || [];
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  /* unsettled, non-returned packages grouped per company */
  const byCompany = $derived.by(() => {
    const m = new Map();
    for (const s of sales) {
      if (s.status === 'returned' || s.settledAt) continue;
      const key = s.deliveryCompany || 'بدون شركة';
      const cur = m.get(key) || { company: key, count: 0, amount: 0, sales: [] };
      cur.count++;
      cur.amount += Number(s.total) || 0;
      cur.sales.push(s);
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  });

  const inTransit = $derived(byCompany.reduce((a, c) => a + c.amount, 0));
  const inTransitCount = $derived(byCompany.reduce((a, c) => a + c.count, 0));

  const settled = $derived(
    sales
      .filter((s) => s.settledAt && s.status !== 'returned')
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
      .slice(0, 10)
  );
  const settledTotal = $derived(settled.reduce((a, s) => a + (Number(s.total) || 0), 0));

  function groupOf(company) {
    return byCompany.find((c) => c.company === company);
  }

  /* كشف التسليم — the driver's manifest for one company */
  function buildManifest(group) {
    const lines = [];
    lines.push(`📦 كشف تسليم — ${group.company}`);
    lines.push(`بوتيك غزالة — ${fmtNum(group.count)} قطعة`);
    lines.push('');
    for (const s of group.sales) {
      lines.push(`#${s.id} — ${s.customerName || 'زبون'}`);
      if (s.customerPhone) lines.push(`   📞 ${s.customerPhone}`);
      const area = [s.province, s.address].filter(Boolean).join(' — ');
      if (area) lines.push(`   📍 ${area}`);
      lines.push(`   💰 المبلغ: ${fmtIQD(s.total)}`);
      if (s.barcode) lines.push(`   #️⃣ ${s.barcode}`);
      lines.push('');
    }
    lines.push(`الإجمالي المطلوب: ${fmtIQD(group.amount)}`);
    return lines.join('\n');
  }

  async function settleGroup(group) {
    const ok = await askConfirm({
      title: `تسوية ${group.company}؟`,
      body: `${group.count} قطعة بمبلغ ${fmtIQD(group.amount)} ستُسجَّل كمستلمة من الشركة.`,
      okLabel: 'تم التسليم نقداً'
    });
    if (!ok) return;
    const now = new Date().toISOString();
    for (const s of group.sales) await settleSale(s.id);
    buzz([20, 50, 20]);
    toastOk(`استلمت ${fmtIQD(group.amount)} من ${group.company}`);
    detail = null;
  }

  async function copyManifest(group) {
    const ok = await copyText(buildManifest(group));
    buzz([14, 30, 14]);
    toastOk(ok ? 'نُسخ كشف التسليم — الصقيه وأرسليه للسائق 📋' : 'تعذّر النسخ');
  }

  async function sendManifest(group) {
    const { opened, copied } = await sendWhatsApp(buildManifest(group));
    buzz([14, 30, 14]);
    if (opened) toastOk('فُتح واتساب بالكشف — أرسليه للسائق 🚚');
    else if (copied) toastOk('نُسخ الكشف — واتساب غير متاح هنا');
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="transit rise" style="animation-delay:0.03s">
    <div class="t-head">
      <span class="t-ic"><Icon name="truck" size={20} color="#fff" /></span>
      <div>
        <div class="muted small">عند شركات التوصيل الآن</div>
        <div class="t-amount"><span>{fmtIQD(inTransit)}</span></div>
        <div class="muted small">{fmtNum(inTransitCount)} قطعة لم تُستلم بعد</div>
      </div>
    </div>
  </Glass>

  <!-- names & money in one place: the companies list is edited right here -->
  <Glass class="rise co-edit" style="animation-delay:0.045s">
    <h2 class="h2" style="margin-bottom:4px"><Icon name="truck" size={17} color="var(--burgundy)" /> شركات التوصيل</h2>
    <p class="muted small" style="margin:0 0 10px">ضيفي الشركات اللي تتعاملين معها — تظهر لكِ قائمة جاهزة عند إتمام البيع.</p>
    <div class="row wrap" style="gap:8px; margin-bottom:10px">
      {#each companies as c (c)}
        <span class="chip on">
          {c}
          <button class="chip-x" onclick={() => rmCo(c)} aria-label="حذف {c}">
            <Icon name="x" size={12} color="#fff" />
          </button>
        </span>
      {/each}
      {#if !companies.length}<span class="muted small">لا شركات بعد — ضيفي الأولى</span>{/if}
    </div>
    <div class="row" style="gap:8px">
      <input class="input" style="flex:1" bind:value={newCo} placeholder="اسم الشركة…" onkeydown={(e) => e.key === 'Enter' && addCo()} />
      <button class="btn" onclick={addCo}><Icon name="plus" size={16} /> إضافة</button>
    </div>
  </Glass>

  {#if byCompany.length === 0}
    <EmptyState
      title="لا شيء عند الشركات"
      subtitle="كل المبالغ المسلّمة استلمتها — أو لا توجد توصيلات بعد"
      icon="check"
    />
  {:else}
    <div class="stack" style="gap:10px">
      {#each byCompany as g, i (g.company)}
        <Glass
          as="button"
          class="co rise"
          style="animation-delay:{0.06 + i * 0.05}s"
          onclick={() => { buzz(6); detail = g; }}
        >
          <span class="co-ic"><Icon name="truck" size={19} color="var(--burgundy)" /></span>
          <div class="a-body">
            <div class="bold">{g.company}</div>
            <div class="muted small">{g.count} قطعة • آخر عملية {fmtDate(g.sales[g.sales.length - 1].date)}</div>
          </div>
          <div class="col" style="align-items:flex-end; gap:2px">
            <div class="money">{fmtIQD(g.amount)}</div>
            <span class="muted tiny">اضغطي للتفاصيل</span>
          </div>
        </Glass>
      {/each}
    </div>
  {/if}

  {#if settled.length}
    <Glass class="hist rise" style="animation-delay:0.15s">
      <button class="hist-head" onclick={() => { buzz(6); showHistory = !showHistory; }}>
        <span class="bold small">آخر التسويات — {fmtIQD(settledTotal)}</span>
        <span class="chev" class:flip={showHistory}><Icon name="back" size={14} color="var(--taupe)" /></span>
      </button>
      {#if showHistory}
        <div class="stack" style="gap:6px; margin-top:8px">
          {#each settled as s (s.id)}
            <div class="hist-row">
              <span class="bold small">#{s.id} {s.customerName || 'زبون'}</span>
              <span class="muted tiny">{s.deliveryCompany || 'بدون شركة'}</span>
              <span class="money small">{fmtIQD(s.total)}</span>
              <span class="muted tiny">{fmtDate(s.settledAt)}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Glass>
  {/if}
</div>

<Sheet open={!!detail} title={detail ? `تفاصيل ${detail.company}` : ''} onclose={() => (detail = null)}>
  {#if detail}
    <div class="stack" style="gap:12px">
      <Glass class="sum">
        <div class="row" style="justify-content:space-between">
          <span class="muted small">عدد القطع</span>
          <span class="bold">{fmtNum(detail.count)}</span>
        </div>
        <div class="row" style="justify-content:space-between">
          <span class="muted small">المبلغ المستحق</span>
          <span class="money" style="color:var(--burgundy); font-size:17px">{fmtIQD(detail.amount)}</span>
        </div>
      </Glass>

      <div class="stack" style="gap:8px">
        {#each detail.sales as s (s.id)}
          <Glass class="row" style="padding:10px 12px; border-radius:var(--r-md); justify-content:space-between">
            <div>
              <div class="bold small">#{s.id} {s.customerName || 'زبون'}</div>
              <div class="muted tiny">{s.status === 'delivered' ? 'تم التسليم' : 'قيد التوصيل'}{s.barcode ? ' • ' + s.barcode : ''}</div>
            </div>
            <div class="money small">{fmtIQD(s.total)}</div>
          </Glass>
        {/each}
      </div>

      <div class="row" style="gap:8px">
        <button class="btn" style="flex:1" onclick={() => copyManifest(detail)}>
          <Icon name="file" size={17} /> نسخ الكشف
        </button>
        <button class="btn wa" style="flex:1" onclick={() => sendManifest(detail)}>
          <Icon name="whatsapp" size={17} /> إرسال للسائق
        </button>
      </div>

      <button class="btn primary lg block" onclick={() => settleGroup(detail)}>
        <Icon name="check" size={20} /> تسوية — استلمت {fmtIQD(detail.amount)}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  :global(.transit) { padding: 16px 18px; }
  .t-head { display: flex; align-items: center; gap: 14px; }
  .t-ic {
    width: 46px; height: 46px;
    border-radius: 15px;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 16px rgba(181, 73, 91, 0.3);
    flex: none;
  }
  .t-amount { font-size: 24px; font-weight: 800; color: var(--ink); line-height: 1.25; }
  :global(.co-edit) { padding: 16px; }
  .chip-x {
    background: rgba(255, 255, 255, 0.25);
    border: none;
    border-radius: 50%;
    width: 16px; height: 16px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  :global(.co) {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    cursor: pointer; text-align: right; width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.co:active) { transform: scale(0.98); }
  .co-ic {
    flex: none; width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px; background: var(--accent-soft);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .tiny { font-size: 10.5px; }
  :global(.hist) { padding: 12px 14px; }
  .hist-head {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
  }
  .chev { display: inline-flex; transform: rotate(90deg); transition: transform 0.25s; }
  .chev.flip { transform: rotate(-90deg); }
  .hist-row {
    display: flex; align-items: center; gap: 8px; justify-content: space-between;
    padding: 7px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.35);
    flex-wrap: wrap;
  }
  :global(.sum) { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
  .wa {
    background: linear-gradient(135deg, #25d366, #1faf54);
    color: #fff; border: none;
    box-shadow: 0 4px 14px rgba(31, 175, 84, 0.25);
  }
</style>
