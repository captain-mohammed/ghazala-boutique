<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, sweepExpiredReservations, cancelReservation, convertReservation, piecesSoldToday } from '../db.js';
  import { fmtIQD, fmtDate, fmtNum, buzz, iqd } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt, milestoneFor } from '../store.js';

  let reservations = $state([]);
  let converting = $state(null); // reservation in the convert sheet
  let fee = $state(5000);
  let variantOf = $state({}); // sku → { color, size } for the variant line on each card

  $effect(() => {
    let alive = true;
    const grab = async () => {
      await sweepExpiredReservations();
      const r = await db.reservations.toArray();
      if (!alive) return;
      reservations = r.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const need = reservations.filter((x) => x.status === 'active').map((x) => x.sku);
      if (need.length) {
        const ps = await db.products.bulkGet(need);
        const m = {};
        for (const p of ps) if (p) m[p.sku] = { color: p.color || '', size: String(p.size || '').trim() };
        variantOf = m;
      }
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

  /* العراق 18 محافظة */
  const PROVINCES = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'القادسية', 'ذي قار', 'ميسان', 'مثنى', 'واسط', 'ديالى', 'صلاح الدين'];

  let cName = $state('');
  let cPhone = $state('');
  let cProvince = $state('');
  let cAddress = $state('');
  let tried = $state(false);
  const clientValid = $derived(cName.trim().length > 0 && cPhone.trim().length >= 7 && cProvince !== '');

  async function openConvert(r) {
    converting = r;
    cName = r.customerName || '';
    cPhone = r.customerPhone || '';
    cProvince = '';
    cAddress = '';
    tried = false;
    buzz(8);
  }

  async function doConvert() {
    if (!clientValid) { tried = true; buzz([30, 40, 30]); return; }
    try {
      const sale = await convertReservation(converting.id, { deliveryFee: iqd(fee), province: cProvince, address: cAddress });
      converting = null;
      buzz([30, 60, 30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🛍️');
      toastOk(`تم البيع #${sale.id} — ${fmtIQD(sale.total)}`);
      const sold = await piecesSoldToday();
      const ms = milestoneFor(sold);
      if (ms) {
        setTimeout(() => {
          celebrateAt(window.innerWidth / 2, window.innerHeight / 2.4, '🏆');
          buzz([40, 80, 40, 80, 40]);
          toastOk(ms.text, 'success', 4200);
        }, 700);
      }
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
        <Glass class="res rise" style="animation-delay:{Math.min(i * 0.05, 0.3)}s">
          <div class="row" style="justify-content:space-between">
            <span class="bold">{r.name}</span>
            <span class="chip-n warn-chip">{hoursLeft(r) < 6 ? '⏳' : ''} {fmtNum(Math.floor(hoursLeft(r)))} ساعة</span>
          </div>
          <div class="muted small">{r.customerName || 'زبونة'}{r.customerPhone ? ' • ' + r.customerPhone : ''} • حُجز {fmtDate(r.createdAt)}</div>
          {#if variantOf[r.sku]}
            <VariantBits dense variants={[variantOf[r.sku]]} />
          {/if}
          <div class="row" style="justify-content:space-between; margin-top:10px">
            <span class="money">{fmtIQD(r.price)}</span>
            <div class="row" style="gap:8px">
              <button class="btn danger" style="min-height:40px; padding:0 14px" onclick={() => doCancel(r)}>إلغاء</button>
              <button class="btn primary" style="min-height:40px; padding:0 14px" onclick={() => openConvert(r)}>
                <Icon name="cart" size={16} /> تحويل لبيع
              </button>
            </div>
          </div>
        </Glass>
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
        <div class="row" style="justify-content:space-between"><span class="muted small">السعر</span><span class="money">{fmtIQD(converting.price)}</span></div>
      </Glass>
      <div class="row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>الاسم <span class="req">*</span></label>
          <input class="input" bind:value={cName} class:invalid={tried && !cName.trim()} />
          {#if tried && !cName.trim()}<span class="err">مطلوب</span>{/if}
        </div>
        <div class="field" style="flex:1">
          <label>الهاتف <span class="req">*</span></label>
          <input class="input" bind:value={cPhone} class:invalid={tried && cPhone.trim().length < 7} inputmode="tel" />
          {#if tried && cPhone.trim().length < 7}<span class="err">رقم صحيح مطلوب</span>{/if}
        </div>
      </div>
      <div class="row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>المحافظة <span class="req">*</span></label>
          <select class="input" bind:value={cProvince} class:invalid={tried && !cProvince} style="height:50px">
            <option value="" disabled>اختاري…</option>
            {#each PROVINCES as pv (pv)}<option value={pv}>{pv}</option>{/each}
          </select>
          {#if tried && !cProvince}<span class="err">مطلوبة</span>{/if}
        </div>
        <div class="field" style="flex:1">
          <label>العنوان <span class="muted tiny">(اذا متوفر)</span></label>
          <input class="input" bind:value={cAddress} placeholder="أقرب نقطة دالة…" />
        </div>
      </div>
      <div class="field">
        <label>أجور التوصيل (د.ع) <span class="muted tiny">— 5 = 5,000</span></label>
        <input class="input" bind:value={fee} inputmode="decimal" />
      </div>
      <button class="btn primary lg block" onclick={doConvert}>
        <Icon name="check" size={20} /> تأكيد البيع — {fmtIQD(converting.price + iqd(fee))}
      </button>
    </div>
  {/if}
</Sheet>

<style>
  :global(.res) { padding: 13px 15px; display: flex; flex-direction: column; gap: 4px; }

  .req { color: var(--burgundy); font-weight: 800; }
  .err { display: block; font-size: 11px; color: var(--burgundy); font-weight: 700; margin-top: 3px; }
  :global(.invalid) { border-color: rgba(181, 73, 91, 0.55) !important; background: rgba(181, 73, 91, 0.05); }
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
