<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { db, setSaleStatus, returnSale } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz, buildSalesMessage, sendWhatsApp } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  const FILTERS = [
    { id: 'all', label: 'الكل' },
    { id: 'pending', label: 'قيد التوصيل' },
    { id: 'delivered', label: 'تم التسليم' },
    { id: 'returned', label: 'راجع' }
  ];

  let sales = $state([]);
  let filter = $state('all');
  let detail = $state(null);
  let waTemplate = $state(null); // loaded once from settings

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const s = await db.sales.toArray();
      if (alive) sales = s.sort((a, b) => new Date(b.date) - new Date(a.date));
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  /* Pick up a template edited in الإعدادات live (SalesLog polls too, but the
     template only needs a cheap one-shot read per screen mount). */
  $effect(() => {
    let alive = true;
    const grab = async () => {
      const row = await db.settings.get('waTemplate');
      if (alive) waTemplate = row?.value || null;
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const filtered = $derived(filter === 'all' ? sales : sales.filter((s) => s.status === filter));

  const counts = $derived.by(() => {
    const c = { all: sales.length, pending: 0, delivered: 0, returned: 0 };
    for (const s of sales) if (c[s.status] != null) c[s.status]++;
    return c;
  });

  const STATUS = {
    pending: { label: 'قيد التوصيل', cls: 'st-pending' },
    delivered: { label: 'تم التسليم', cls: 'st-delivered' },
    returned: { label: 'راجع', cls: 'st-returned' }
  };

  /* The WhatsApp action belongs to sales still in play — قيد التوصيل أو راجع.
     A delivered sale's notification was already sent. */
  const waEligible = (s) => s.status === 'pending' || s.status === 'returned';

  async function markDelivered(s) {
    await setSaleStatus(s.id, 'delivered');
    buzz([20, 40, 20]);
    toastOk('تم تحديث الحالة: تم التسليم');
    if (detail?.id === s.id) detail = { ...detail, status: 'delivered' };
  }

  async function doReturn(s) {
    const ok = await askConfirm({
      title: 'إرجاع البيع؟',
      body: 'ستُعاد الكميات إلى المخزون وتُحدَّث حالة العملية إلى راجع.',
      okLabel: 'إرجاع',
      danger: true
    });
    if (!ok) return;
    await returnSale(s.id);
    toastOk('تم الإرجاع وإعادة الكميات للمخزون');
    if (detail?.id === s.id) detail = { ...detail, status: 'returned' };
  }

  async function shareWhatsApp(s) {
    const msg = buildSalesMessage(s, waTemplate);
    const { opened, copied } = await sendWhatsApp(msg, s.customerPhone);
    buzz([14, 30, 14]);
    if (opened) {
      toastOk(s.customerPhone ? 'فُتح واتساب برسالة جاهزة — أرسلها 💬' : 'فُتح واتساب — اختر محادثة الزبون وأرسل 💬');
    } else if (copied) {
      toastOk('تعذر فتح واتساب — نُسخت الرسالة للصقها 💬');
    } else {
      toastErr('تعذر فتح واتساب أو النسخ');
    }
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row noscroll" style="gap:8px; overflow-x:auto; padding-bottom:2px">
    {#each FILTERS as f (f.id)}
      <button class="chip" class:on={filter === f.id} onclick={() => (filter = f.id)}>
        {f.label}
        <span class="chip-n" class:dim={filter !== f.id}>{counts[f.id] ?? 0}</span>
      </button>
    {/each}
  </div>

  {#if filtered.length === 0}
    <EmptyState
      title="لا مبيعات هنا بعد"
      subtitle="أول عملية بيع ستظهر هنا مع كل تفاصيلها — اسم الزبونة، القطع، والحالة"
      icon="list"
    />
  {:else}
    <div class="stack" style="gap:10px">
      {#each filtered as s, i (s.id)}
        <button class="sale glass rise" style="animation-delay:{Math.min(i * 0.04, 0.3)}s" onclick={() => { buzz(6); detail = s; }}>
          <span class="s-ic"><Icon name={s.status === 'returned' ? 'undo' : 'truck'} size={19} color="var(--burgundy)" /></span>
          <div class="a-body">
            <div class="row" style="gap:8px">
              <span class="bold">#{s.id} {s.customerName || 'زبون'}</span>
              <span class="st {STATUS[s.status]?.cls}">{STATUS[s.status]?.label}</span>
            </div>
            <div class="muted small">{fmtDate(s.date)} • {s.items.length} قطعة {s.barcode ? '• ' + s.barcode : ''}</div>
          </div>
          <div class="col" style="align-items:flex-end; gap:6px">
            <div class="money">{fmtIQD(s.total)}</div>
            {#if waEligible(s)}
              <span
                class="wa-chip"
                role="button"
                tabindex="0"
                aria-label="إرسال رسالة الواتساب"
                onclick={(e) => { e.stopPropagation(); shareWhatsApp(s); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); shareWhatsApp(s); } }}
              >
                <Icon name="whatsapp" size={14} /> واتساب
              </span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<Sheet open={!!detail} title="تفاصيل العملية" onclose={() => (detail = null)}>
  {#if detail}
    <div class="stack" style="gap:12px">
      <div class="glass head-card">
        <div class="row" style="justify-content:space-between">
          <span class="bold">#{detail.id} — {detail.customerName || 'زبون'}</span>
          <span class="st {STATUS[detail.status]?.cls}">{STATUS[detail.status]?.label}</span>
        </div>
        <div class="muted small">{fmtDate(detail.date)}</div>
        {#if detail.customerPhone}
          <div class="row small muted"><Icon name="phone" size={14} /> {detail.customerPhone}</div>
        {/if}
        {#if detail.barcode}
          <div class="row small muted"><Icon name="scan" size={14} /> باركود شركة التوصيل: <span class="bold" style="letter-spacing:1px">{detail.barcode}</span></div>
        {/if}
      </div>

      <div class="stack" style="gap:8px">
        {#each detail.items as it (it.sku)}
          <div class="row glass" style="padding:10px 12px; border-radius:var(--r-md); justify-content:space-between">
            <div>
              <div class="bold small">{it.name}</div>
              <div class="muted small">{fmtIQD(it.price)} × {it.qty}</div>
            </div>
            <div class="money small">{fmtIQD(it.price * it.qty)}</div>
          </div>
        {/each}
      </div>

      <div class="glass" style="padding:12px 16px; display:flex; flex-direction:column; gap:5px">
        <div class="row" style="justify-content:space-between"><span class="muted small">المجموع</span><span class="money">{fmtIQD(detail.subtotal)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">التوصيل</span><span class="money">{fmtIQD(detail.deliveryFee)}</span></div>
        <hr class="divider-gold" style="margin:2px 0" />
        <div class="row" style="justify-content:space-between"><span class="bold">الإجمالي</span><span class="money" style="color:var(--burgundy)">{fmtIQD(detail.total)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">الربح</span><span class="money" style="color:var(--good)">{fmtIQD(detail.profit)}</span></div>
      </div>

      {#if waEligible(detail)}
        <button class="btn wa block" onclick={() => shareWhatsApp(detail)}>
          <Icon name="whatsapp" size={18} /> إرسال رسالة الواتساب للزبون
        </button>
      {/if}

      {#if detail.status === 'pending'}
        <div class="row" style="gap:10px">
          <button class="btn primary" style="flex:1" onclick={() => markDelivered(detail)}>
            <Icon name="check" size={17} /> تم التسليم
          </button>
          <button class="btn danger" style="flex:1" onclick={() => doReturn(detail)}>
            <Icon name="undo" size={17} /> إرجاع
          </button>
        </div>
      {:else if detail.status === 'delivered'}
        <button class="btn danger block" onclick={() => doReturn(detail)}>
          <Icon name="undo" size={17} /> إرجاع العملية
        </button>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .sale {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sale:active { transform: scale(0.98); }
  .s-ic {
    flex: none;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
    background: var(--accent-soft);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .wa-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 800;
    color: #1faf54;
    background: rgba(37, 211, 102, 0.12);
    border: 1px solid rgba(37, 211, 102, 0.3);
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
    white-space: nowrap;
  }
  .wa-chip:active { transform: scale(0.92); }
  .wa {
    background: linear-gradient(135deg, #25d366, #1faf54);
    color: #fff;
    border: none;
    box-shadow: 0 8px 20px rgba(31, 175, 84, 0.3);
  }
  .st {
    font-size: 10.5px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .st-pending { background: rgba(192, 127, 58, 0.15); color: var(--warn); }
  .chip-n {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10.5px;
    font-weight: 800;
    background: rgba(255, 255, 255, 0.25);
    color: inherit;
  }
  .chip-n.dim { background: rgba(122, 46, 58, 0.08); color: var(--taupe); }
  .st-delivered { background: rgba(78, 138, 95, 0.14); color: var(--good); }
  .st-returned { background: rgba(122, 46, 58, 0.12); color: var(--burgundy-deep); }
  .head-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .empty { padding: 26px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .empty-ic {
    width: 64px; height: 64px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: var(--accent-soft);
  }
</style>
