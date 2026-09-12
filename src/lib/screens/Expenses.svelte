<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db, addExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, isSameDay, startOfToday, daysAgoStart, buzz, iqd, baghdadLocalInput, isoFromBaghdadLocal } from '../utils.js';
  import { toastOk, toastErr } from '../store.js';

  let expenses = $state([]);
  let amount = $state('');
  let category = $state('نقل');
  let note = $state('');
  /* تحرير مصروف: المبلغ والملاحظة والوقت — الوقت ينقله لتقريره الصحيح */
  let editing = $state(null);
  let eAmount = $state('');
  let eNote = $state('');
  let eTs = $state('');

  function openEdit(e) {
    editing = e;
    eAmount = String(e.amount);
    eNote = e.note || '';
    eTs = baghdadLocalInput(new Date(e.date));
    buzz(8);
  }
  async function saveEdit() {
    if (!editing) return;
    const iso = isoFromBaghdadLocal(eTs);
    if (!iso) { toastErr('وقت غير صالح'); return; }
    if (new Date(iso).getTime() > Date.now() + 60000) { toastErr('الوقت لا يكون بالمستقبل'); buzz([30, 40, 30]); return; }
    await updateExpense(editing.id, { amount: iqd(eAmount) || editing.amount, note: eNote, date: iso });
    editing = null;
    buzz([14, 30, 14]);
    toastOk('حُرر المصروف — التقرير يحسبه بوقته الجديد');
  }

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const e = await db.expenses.toArray();
      if (alive) expenses = e.sort((a, b) => new Date(b.date) - new Date(a.date));
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const CAT_ICONS = { 'إيجار': 'home', 'نقل': 'truck', 'تغليف': 'box', 'كهرباء': 'flame', 'أخرى': 'dots' };

  const todayTotal = $derived(
    expenses.filter((e) => isSameDay(e.date, startOfToday())).reduce((a, e) => a + e.amount, 0)
  );
  const monthTotal = $derived(
    expenses.filter((e) => new Date(e.date) >= daysAgoStart(29)).reduce((a, e) => a + e.amount, 0)
  );
  const allTotal = $derived(expenses.reduce((a, e) => a + e.amount, 0));

  async function save() {
    const amt = iqd(amount);
    if (!amt || amt <= 0) { toastOk('اكتب المبلغ أولاً'); return; }
    await addExpense({ amount: amt, category, note });
    amount = '';
    note = '';
    buzz([14, 30, 14]);
  }

  async function remove(e) {
    await deleteExpense(e.id);
    buzz(10);
  }
</script>

<div class="stack" style="gap:12px">
  <Glass class="rise" style="animation-delay:0.03s; padding:16px">
    <div class="row" style="gap:8px; margin-bottom:12px">
      <div class="field" style="flex:1">
        <label>المبلغ (د.ع)</label>
        <input class="input" bind:value={amount} inputmode="numeric" placeholder="0" />
      </div>
      <div class="field" style="flex:1">
        <label>النوع</label>
        <div class="row wrap" style="gap:6px">
          {#each EXPENSE_CATEGORIES as c (c)}
            <button type="button" class="chip" class:on={category === c} onclick={() => { category = c; buzz(5); }}>{c}</button>
          {/each}
        </div>
      </div>
    </div>
    <div class="row" style="gap:8px">
      <input class="input" bind:value={note} placeholder="ملاحظة (اختياري)…" style="flex:1" onkeydown={(e) => e.key === 'Enter' && save()} />
      <button class="btn primary" onclick={save}><Icon name="plus" size={17} /> إضافة</button>
    </div>
  </Glass>

  <div class="sums">
    <Glass class="sum rise" style="animation-delay:0.06s">
      <div class="muted small">اليوم</div>
      <div class="sum-n">{fmtIQD(todayTotal)}</div>
    </Glass>
    <Glass class="sum rise" style="animation-delay:0.09s">
      <div class="muted small">30 يوم</div>
      <div class="sum-n">{fmtIQD(monthTotal)}</div>
    </Glass>
    <Glass class="sum rise" style="animation-delay:0.12s">
      <div class="muted small">الكل</div>
      <div class="sum-n">{fmtIQD(allTotal)}</div>
    </Glass>
  </div>

  {#if expenses.length === 0}
    <EmptyState
      title="لا مصاريف مسجلة"
      subtitle="سجّل الإيجار والنقل والتغليف — تُخصم تلقائياً من الربح في التقارير"
      icon="wallet"
    />
  {:else}
    <div class="stack" style="gap:8px">
      {#each expenses as e, i (e.id)}
        <Glass class="exp rise" style="animation-delay:{Math.min(i * 0.03, 0.25)}s">
          <span class="e-ic"><Icon name={CAT_ICONS[e.category] || 'dots'} size={18} color="var(--burgundy)" /></span>
          <div class="a-body">
            <div class="bold small">{e.category}{e.note ? ' — ' + e.note : ''}</div>
            <div class="muted tiny">{fmtDate(e.date)}</div>
          </div>
          <div class="money small">-{fmtIQD(e.amount)}</div>
          <button class="e-x" aria-label="تعديل" onclick={() => openEdit(e)}><Icon name="edit" size={12} /></button>
          <button class="e-x" aria-label="حذف" onclick={() => remove(e)}><Icon name="x" size={13} /></button>
        </Glass>
      {/each}
    </div>
  {/if}
</div>

<Sheet open={!!editing} title="تعديل المصروف" onclose={() => (editing = null)}>
  {#if editing}
    <div class="stack" style="gap:12px">
      <div class="row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>المبلغ (د.ع)</label>
          <input class="input" bind:value={eAmount} inputmode="numeric" />
        </div>
        <div class="field" style="flex:1">
          <label>الوقت (بتوقيت بغداد)</label>
          <input class="input ts-input" type="datetime-local" bind:value={eTs} max={baghdadLocalInput()} />
        </div>
      </div>
      <div class="field">
        <label>ملاحظة</label>
        <input class="input" bind:value={eNote} placeholder="اختياري…" />
      </div>
      <button class="btn primary lg block" onclick={saveEdit}><Icon name="check" size={18} /> حفظ التعديل</button>
      <p class="muted tiny" style="margin:0">تعديل الوقت ينقل المصروف لتقريره الصحيح — صافي الشهر يُحسب من التاريخ.</p>
    </div>
  {/if}
</Sheet>

<style>
  .sums { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  :global(.sum) { padding: 11px 13px; display: flex; flex-direction: column; gap: 2px; }
  .sum-n { font-weight: 800; font-size: 14.5px; color: var(--burgundy-deep); }
  :global(.exp) {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px;
  }
  .e-ic {
    flex: none; width: 38px; height: 38px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px; background: var(--accent-soft);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .tiny { font-size: 10.5px; }
  .e-x {
    flex: none; width: 28px; height: 28px;
    border-radius: 50%; border: none;
    background: rgba(181, 73, 91, 0.08); color: var(--burgundy);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  }
  .e-x[aria-label="تعديل"] { background: rgba(201, 161, 90, 0.14); color: #8a6a35; }
  .ts-input { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; }
</style>
