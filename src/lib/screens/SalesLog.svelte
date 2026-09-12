<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, setSaleStatus, returnSale } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, fmtAgo, buzz, buildSalesMessage, sendWhatsApp, salePieces } from '../utils.js';
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

  /* صور القطع — الصورة هي الهوية، تُجلب للتفاصيل */
  let photos = $state({});
  $effect(() => {
    let alive = true;
    db.products.toArray().then((ps) => {
      if (alive) photos = Object.fromEntries(ps.map((p) => [p.sku, { photo: p.photo, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '' }]));
    });
    return () => { alive = false; };
  });

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

  /* ---- Swipe the sale row: pull left follows the finger, revealing
     both quick actions (تم التسليم / راجع) side by side. Tap the open
     row to close it, swipe right or tap another row to snap shut. ---- */
  const OPEN = 150; /* يكفي لعرض الزرين معاً */
  let swipedId = $state(null);
  let drag = $state(0); /* الإزاحة اللحظية أثناء السحب — الصف تتبع الإصبع */
  let dragging = $state(false);
  const swipe = { active: false, id: null, x0: 0, dx: 0 };

  function swipeStart(e, id) {
    if (e.pointerType === 'mouse') return;
    swipe.active = true;
    dragging = true;
    swipe.id = id;
    swipe.x0 = e.clientX;
    swipe.dx = 0;
  }
  function swipeMove(e) {
    if (!swipe.active) return;
    swipe.dx = e.clientX - swipe.x0;
    /* مقاومة ناعمة بعد نقطة الفتح، وسحب للخلف يغلق الصف مباشرة */
    if (swipedId === swipe.id) {
      drag = Math.min(0, Math.max(-OPEN - 40, -OPEN + swipe.dx));
    } else {
      drag = swipe.dx < 0 ? Math.max(-OPEN - 40, swipe.dx) : 0;
    }
  }
  function swipeEnd() {
    if (!swipe.active) return;
    swipe.active = false;
    dragging = false;
    if (swipedId === swipe.id) {
      if (drag > -OPEN + 34) swipedId = null; /* سُحبت للخلف بعيداً */
    } else if (swipe.dx < -46) {
      swipedId = swipe.id;
      buzz(8);
    }
    drag = 0;
    swipe.dx = 0;
  }

  function rowX(s) {
    /* أثناء السحب الفعلي يأخذ الإزاحة اللحظية الأولوية — تتبع الإصبع باتجاهين */
    if (swipe.active && swipe.id === s.id) return drag;
    if (swipedId === s.id) return -OPEN;
    return 0;
  }

  async function shareWhatsApp(s) {
    const msg = buildSalesMessage(s, waTemplate);
    const { opened, copied } = await sendWhatsApp(msg, s.customerPhone);
    buzz([14, 30, 14]);
    if (opened) {
      toastOk(s.customerPhone ? 'فُتح واتساب برسالة جاهزة — أرسليها 💬' : 'فُتح واتساب — اختاري محادثة الزبون وأرسلي 💬');
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="swipe-wrap"
          class:open={swipedId === s.id}
          class:dragging={dragging && swipe.id === s.id}
          onpointerdown={(e) => swipeStart(e, s.id)}
          onpointermove={swipeMove}
          onpointerup={swipeEnd}
          onpointercancel={swipeEnd}
        >
          <!-- actions live under the full row width — both always visible when open -->
          {#if swipedId === s.id || (swipe.active && swipe.id === s.id && drag < -60)}
            <div class="swipe-actions">
              {#if s.status !== 'delivered'}
                <button class="sw-btn ok" onclick={() => { swipedId = null; markDelivered(s); }}>
                  <Icon name="check" size={17} /> تم التسليم
                </button>
              {/if}
              {#if s.status !== 'returned'}
                <button class="sw-btn ret" onclick={() => { swipedId = null; doReturn(s); }}>
                  <Icon name="undo" size={16} /> راجع
                </button>
              {/if}
            </div>
          {/if}
          <Glass
            as="button"
            class="sale rise {swipedId === s.id ? 'dimmed' : ''}"
            style="animation-delay:{Math.min(i * 0.04, 0.3)}s; transform: translateX({rowX(s)}px)"
            onclick={() => { if (Math.abs(swipe.dx) < 8) { if (swipedId === s.id) { swipedId = null; } else { buzz(6); detail = s; } } }}
          >
          <span class="s-ic"><Icon name={s.status === 'returned' ? 'undo' : 'truck'} size={19} color="var(--burgundy)" /></span>
          <div class="a-body">
            <div class="row" style="gap:8px">
              <span class="bold">{s.customerName || 'زبون'}</span>
              <span class="st {STATUS[s.status]?.cls}">{STATUS[s.status]?.label}</span>
            </div>
            <div class="muted small">{fmtDate(s.date)} - {fmtNum(salePieces(s))} قطعة {s.barcode ? '- ' + s.barcode : ''}</div>
            {#if s.items?.length}
              <VariantBits dense variants={s.items} />
            {/if}
          </div>
          <div class="col" style="align-items:flex-end; gap:6px">
            <div class="money">{fmtIQD(s.subtotal)}</div>
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
          </Glass>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Sheet open={!!detail} title="تفاصيل العملية" onclose={() => (detail = null)}>
  {#if detail}
    <div class="stack" style="gap:12px">
      <Glass class="head-card">
        <div class="row" style="justify-content:space-between">
          <span class="bold">{detail.customerName || 'زبون'}</span>
          <span class="st {STATUS[detail.status]?.cls}">{STATUS[detail.status]?.label}</span>
        </div>
        <div class="muted small">{fmtDate(detail.date)} · {fmtAgo(detail.date)}</div>
        {#if detail.customerPhone}
          <div class="row small muted"><Icon name="phone" size={14} /> {detail.customerPhone}</div>
        {/if}
        {#if detail.province}
          <div class="row small muted"><Icon name="flag" size={14} /> {detail.province}{detail.address ? ' — ' + detail.address : ''}</div>
        {/if}
        {#if detail.barcode}
          <div style="margin-top:6px"><span class="bc-chip"><Icon name="scan" size={13} /> {detail.barcode}</span></div>
        {/if}
      </Glass>

      <div class="stack" style="gap:8px">
        {#each detail.items as it (it.sku)}
          {@const ph = photos[it.sku]?.photo}
          {@const ip = photos[it.sku]}
          <Glass class="row" style="padding:10px 12px; border-radius:var(--r-md); justify-content:space-between">
            <div style="display:flex; gap:10px; align-items:center; min-width:0">
              <span class="it-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={15} color="var(--taupe)" />{/if}</span>
              <div>
                {#if ip && (ip.type || ip.typeSub || ip.typeSub2 || ip.typeSub3)}
                  <div class="bold small">{[ip.type, ip.typeSub, ip.typeSub2, ip.typeSub3].filter(Boolean).join(' - ')}</div>
                {/if}
                <VariantBits variants={[it]} />
                <div class="muted small">{fmtIQD(it.price)} × {it.qty}</div>
              </div>
            </div>
            <div class="money small">{fmtIQD(it.price * it.qty)}</div>
          </Glass>
        {/each}
      </div>

      <Glass style="padding:12px 16px; display:flex; flex-direction:column; gap:5px">
        <div class="row" style="justify-content:space-between"><span class="muted small">المجموع</span><span class="money">{fmtIQD(detail.subtotal)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">أجور التوصيل (تدفعها الزبونة للشركة)</span><span class="money muted">{fmtIQD(detail.deliveryFee)}</span></div>
        <hr class="divider-gold" style="margin:2px 0" />
        <div class="row" style="justify-content:space-between"><span class="bold">إجمالي الفاتورة</span><span class="money" style="color:var(--burgundy)">{fmtIQD(detail.total)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted small">ربح البوتيك (يدخل الخزنة)</span><span class="money" style="color:var(--good)">{fmtIQD(detail.profit)}</span></div>
      </Glass>

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
  .swipe-wrap {
    position: relative;
    border-radius: var(--r-lg);
    overflow: hidden;
    touch-action: pan-y;
  }
  .swipe-actions {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    z-index: 0;
    /* تدرّج خفيف يسبق الأزرار — يوحي بأن هناك أكثر من إجراء */
    background: linear-gradient(to left, rgba(122, 46, 58, 0.06), transparent 55%);
  }
  .sw-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-weight: 800;
    font-size: 12.5px;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: 14px;
    color: #fff;
    white-space: nowrap;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sw-btn:active { transform: scale(0.94); }
  .sw-btn.ok { background: linear-gradient(135deg, #4e8a5f, #3c7050); }
  .sw-btn.ret { background: linear-gradient(135deg, var(--burgundy), var(--burgundy-deep)); }
  .swipe-wrap :global(.sale) {
    position: relative;
    z-index: 1;
    transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform;
    touch-action: pan-y;
  }
  /* أثناء السحب الفعلي: بلا انتقال وبلا أنيميشن دخول — الصف تتبع الإصبع لحظياً.
     أنيميشن .rise بـ fill-mode both كان يطغى على التحويل اللحظي. */
  .swipe-wrap.dragging :global(.sale) { transition: none; animation: none; }
  /* .rise uses fill-mode both — release it so the open-translate applies */
  .swipe-wrap.open :global(.sale) { animation: none; }
  /* الصف المفتوح يخفت قليلاً — الأزرار هي البطلة */
  .swipe-wrap :global(.sale.dimmed) { filter: brightness(0.97); }

  :global(.sale) {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.sale:active) { transform: scale(0.98); }
  .s-ic {
    flex: none;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
    background: var(--accent-soft);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .it-thumb {
    flex: none;
    width: 40px; height: 40px;
    border-radius: 10px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--line);
  }
  .it-thumb img { width: 100%; height: 100%; object-fit: cover; }
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
  :global(.head-card) { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .bc-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 800;
    font-size: 12.5px;
    letter-spacing: 1.5px;
    color: var(--burgundy-deep);
    background: rgba(255, 255, 255, 0.55);
    border: 1px dashed var(--line-2);
    padding: 6px 12px;
    border-radius: 10px;
    direction: ltr;
  }
</style>
