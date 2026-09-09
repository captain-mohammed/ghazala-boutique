<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db, sweepExpiredReservations, cancelReservation, convertReservation } from '../db.js';
  import { fmtIQD, fmtDate, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let reservations = $state([]);
  let converting = $state(null); // reservation in the convert sheet
  let fee = $state(5000);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      await sweepExpiredReservations();
      const r = await db.reservations.toArray();
      if (alive) reservations = r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    };
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  const active = $derived(reservations.filter((r) => r.status === 'active'));
  const done = $derived(reservations.filter((r) => r.status !== 'active').slice(0, 12));

  /* hours left until expiry, for the countdown chip */
  function hoursLeft(r) {
    return Math.max(0, (new Date(r.expiresAt).getTime() - Date.now()) / 3600000);
  }

  async function doCancel(r) {
    const ok = await askConfirm({
      title: 'إلغاء الحجز؟',
      body: `ستُعاد القطعة «${r.name}» إلى المخزون.`,
      okLabel: 'إلغاء الحجز',
      danger: true
    });
    if (!ok) return;
    await cancelReservation(r.id);
    toastOk('أُلغي الحجز وعادت القطعة للمخزون');
  }

  async function openConvert(r) {
    converting = r;
    buzz(8);
  }

  async function doConvert() {
    try {
      const sale = await convertReservation(converting.id, { deliveryFee: Number(fee) || 0 });
      converting = null;
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🛍️');
      toastOk(`تم البيع #${sale.id} — ${fmtIQD(sale.total)}`);
    } catch (e) {
      toastErr('تعذر تحويل الحجز');
      console.error(e);
    }
  }
</script>

<div class="stack" style="gap:12px">
  {#if active.length === 0}
    <EmptyState
      title="لا حجوزات نشطة"
      subtitle="احجز قطعة لزبونة من صفحة الموديل — الكمية تُحجز تلقائياً لمدة 48 ساعة"
      icon="clock"
    />
  {:else}
    <div class="stack" style="gap:10px">
      {#each active as r, i (r.id)}
        <div class="glass res rise" style="animation-delay:{Math.min(i * 0.05, 0.3)}s">
          <div class="row" style="justify-content:space-between">
            <span class="bold">{r.name}</span>
            <span class="chip-n warn-chip">{hoursLeft(r) < 6 ? '⏳' : ''} {fmtNum(Math.floor(hoursLeft(r)))} ساعة</span>
          </div>
          <div class="muted small">{r.customerName || 'زبونة'}{r.customerPhone ? ' • ' + r.customerPhone : ''} • حُجز {fmtDate(r.createdAt)}</div>
          <div class="row" style="justify-content:space-between; margin-top:10px">
            <span class="money">{fmtIQD(r.price)}</span>
            <div class="row" style="gap:8px">
              <button class="btn danger" style="min-height:40px; padding:0 14px" onclick={() => doCancel(r)}>إلغاء</button>
              <button class="btn primary" style="min-height:40px; padding:0 14px" onclick={() => openConvert(r)}>
                <Icon name="cart" size={16} /> تحويل لبيع
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if done.length}
    <Glass class="done rise" style="animation-delay:0.2s">
      <div class="bold small" style="margin-bottom:8px">سجل الحجوزات</div>
      <div class="stack" style="gap:6px">
        {#each done as r (r.id)}
          <div class="d-row">
            <span class="bold small">{r.name}</span>
            <span class="muted tiny">{r.customerName || 'زبونة'}</span>
            <span class="tag {r.status}">{r.status === 'sold' ? 'تحوّل لبيع' : r.status === 'cancelled' ? 'أُلغي' : 'انتهى'}</span>
            <span class="money small">{fmtIQD(r.price)}</span>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}
</div>

<Sheet open={!!converting} title="تحويل الحجز لبيع" onclose={() => (converting = null)}>
  {#if converting}
    <div class="stack" style="gap:12px">
      <Glass class="sum">
        <div class="row" style="justify-content:space-between"><span class="muted small">الموديل</span><span class="bold">{converting.name}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">الزبونة</span><span class="bold">{converting.customerName || 'زبونة'}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">السعر</span><span class="money">{fmtIQD(converting.price)}</span></div>
      </Glass>
      <div class="field">
        <label>أجور التوصيل (د.ع)</label>
        <input class="input" bind:value={fee} inputmode="numeric" />
      </div>
      <button class="btn primary lg block" onclick={doConvert}>
        <Icon name="check" size={20} /> تأكيد البيع — {fmtIQD(converting.price + (Number(fee) || 0))}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .res { padding: 13px 15px; display: flex; flex-direction: column; gap: 4px; }
  .chip-n {
    min-width: 20px; height: 22px; padding: 0 9px;
    border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800;
  }
  .warn-chip { background: rgba(192, 127, 58, 0.15); color: var(--warn); }
  .done { padding: 13px 15px; }
  .d-row {
    display: flex; align-items: center; gap: 8px; justify-content: space-between;
    padding: 7px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.35);
    flex-wrap: wrap;
  }
  .tag { font-size: 10.5px; font-weight: 800; padding: 2px 8px; border-radius: 999px; }
  .tag.sold { background: rgba(78, 138, 95, 0.14); color: var(--good); }
  .tag.cancelled, .tag.expired { background: rgba(156, 123, 107, 0.15); color: var(--taupe); }
  .sum { padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
</style>
