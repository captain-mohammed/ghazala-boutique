<script>
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Glass from '../components/Glass.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, setSaleStatus, returnSale, returnSaleItems, setSaleDate, loadProducts } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, fmtAgo, buzz, buildSalesMessage, sendWhatsApp, salePieces, saleItemLabel, WA_STATUS_TEMPLATES, baghdadLocalInput, isoFromBaghdadLocal } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  const FILTERS = [
    { id: 'all', label: 'الكل' },
    { id: 'pending', label: 'قيد التوصيل' },
    { id: 'delivered', label: 'تم التسليم' },
    { id: 'returned', label: 'راجع' }
  ];

  let sales = $state([]);
  let lastSalesSig = '';
  let filter = $state('all');
  let detail = $state(null);
  /* تعديل وقت العملية — يسري على الخزنة والحركات والتقارير */
  let tsBox = $state(false);
  let saleTs = $state('');
  async function saveTs() {
    const iso = isoFromBaghdadLocal(saleTs);
    if (!iso) { toastErr('وقت غير صالح'); return; }
    if (new Date(iso).getTime() > Date.now() + 60000) { toastErr('وقت العملية لا يكون بالمستقبل'); buzz([30, 40, 30]); return; }
    await setSaleDate(detail.id, iso);
    detail = { ...detail, date: iso };
    tsBox = false;
    buzz([14, 30, 14]);
    toastOk('حُرر وقت العملية — الخزنة والحركات والتقارير كلها تبعته');
  }
  let waTemplates = $state({}); // { pending, delivered, returned } — قالب لكل حالة
  $effect(() => {
    let alive = true;
    const grab = async () => {
      const s = await db.sales.toArray();
      if (!alive) return;
      /* بصمة رخيصة: لا نعيد رسم القائمة كل ٤ ثوانٍ إلا إذا تغيّرت فعلاً */
      let sig = s.length + ':';
      let m = 0;
      for (let i = 0; i < s.length; i++) {
        const t = Date.parse(s[i].updatedAt || s[i].date || 0);
        if (t > m) m = t;
      }
      sig += m;
      if (sig === lastSalesSig) return;
      lastSalesSig = sig;
      sales = s.sort((a, b) => new Date(b.date) - new Date(a.date));
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  /* Pick up templates edited in الإعدادات live — قالب لكل حالة، يُجلب كل 4 ثوانٍ */
  $effect(() => {
    let alive = true;
    const grab = async () => {
      const keys = Object.values(WA_STATUS_TEMPLATES).map((t) => t.key);
      const rows = await db.settings.bulkGet(keys);
      if (alive) {
        waTemplates = Object.fromEntries(
          keys.map((k, i) => [k, rows[i]?.value || null])
        );
      }
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  const filtered = $derived(filter === 'all' ? sales : sales.filter((s) => s.status === filter));

  /* ---- windowing: only a slice of the (potentially huge) sales list is in the DOM.
     Scrolling grows the slice via an IntersectionObserver sentinel. Avoids mounting
     thousands of swipe-enabled rows at once. ---- */
  const LOG_CAP = 40;
  const LOG_STEP = 40;
  let logVisible = $state(LOG_CAP);
  let logSentinel = $state(null);
  const logShown = $derived(filtered.slice(0, logVisible));
  $effect(() => { filtered; logVisible = LOG_CAP; });
  $effect(() => {
    const el = logSentinel;
    if (!el) return;
    const io = new IntersectionObserver(() => { logVisible += LOG_STEP; }, { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  });

  /* صور القطع — الصورة هي الهوية، تُجلب للتفاصيل */
  let photos = $state({});
  $effect(() => {
    let alive = true;
    loadProducts().then((ps) => {
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
  /* كل حالة لها قالبها — حتى «تم التسليم» لها شكر صغير */
  const waEligible = (s) => !!s;

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

  /* ---- تسليم جزئي: طلب وصل وفيه قطعة رجعت — تُعلَّم الراجعة وحدها ----
     كل قطعة في التفاصيل لها زرّ يبدّلها بين «استلمت» و«راجع». المختار
     يُفصل إلى عملية «راجع» مستقلة ويعود للمخزون، والباقي يبقى مُسلَّماً. */
  let backSel = $state({}); /* كل عملية تُفتح بتحديد فارغ — يُصفَّر عند الفتح */
  const backKeys = $derived(Object.keys(backSel));

  const backPreview = $derived.by(() => {
    if (!detail || !backKeys.length) return { count: 0, amount: 0, keptCount: 0 };
    let count = 0, amount = 0, keptCount = 0;
    for (const it of detail.items || []) {
      if (backSel[it.sku]) { count += it.qty; amount += (Number(it.price) || 0) * it.qty; }
      else keptCount += it.qty;
    }
    return { count, amount, keptCount };
  });

  function toggleBack(sku) {
    const next = { ...backSel };
    if (next[sku]) delete next[sku]; else next[sku] = true;
    backSel = next;
    buzz(6);
  }

  async function doPartialReturn(s) {
    const keys = Object.keys(backSel);
    if (!keys.length) return;
    const ok = await askConfirm({
      title: 'تسليم جزئي',
      body:
        `تُسجَّل ${fmtNum(backPreview.count)} قطعة «راجع» وتعود للمخزون، ` +
        `وتبقى ${fmtNum(backPreview.keptCount)} قطعة مُسلَّمة في العملية.` +
        (s.status === 'pending' ? '\n\nوتُعلَّم العملية «تم التسليم».' : ''),
      okLabel: 'نفّذي'
    });
    if (!ok) return;
    const r = await returnSaleItems(s.id, keys, { markDelivered: true });
    if (!r.ok) { toastErr('ما قدرنا نسجّل الإرجاع الجزئي'); return; }
    backSel = {};
    buzz([20, 40, 20]);
    toastOk(r.split
      ? `تم — ${fmtNum(r.returned)} قطعة رجعت و${fmtNum(r.kept)} بقيت مُسلَّمة`
      : 'تم إرجاع كل القطع');
    detail = null;
  }

  /* ملاحظة: سحب الصف لإظهار «تم التسليم / راجع» أُزيل بطلب صاحبة البوتيك —
     كان يزاحم القراءة ويسحب الصف بلا سبب. الإجراءان باقيان في ورقة
     التفاصيل (اضغطي العملية)، والصف الآن للقراءة فقط. */

  async function shareWhatsApp(s) {
    const statusTpl = WA_STATUS_TEMPLATES[s.status] || WA_STATUS_TEMPLATES.pending;
    const custom = waTemplates[statusTpl.key];
    const msg = buildSalesMessage(s, custom || statusTpl.def);
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
      {#each logShown as s, i (s.id)}
        <Glass
          as="button"
          class="sale rise"
          style="animation-delay:{Math.min(i * 0.04, 0.3)}s"
          onclick={() => { buzz(6); backSel = {}; detail = s; }}
        >
          <!-- الرأس: من، ومتى، وحالتها -->
          <span class="s-head">
            <span class="s-ic"><Icon name={s.status === 'returned' ? 'undo' : 'truck'} size={18} color="var(--burgundy)" /></span>
            <span class="s-id">
              <span class="s-name">{s.customerName || 'زبون'}</span>
              <span class="s-when">{fmtDate(s.date)} · {fmtNum(salePieces(s))} قطعة</span>
            </span>
            <span class="st {STATUS[s.status]?.cls}">{STATUS[s.status]?.label}</span>
          </span>

          <!-- القطع: سطر لكل قطعة — اللون والمقاس والكمية وسعرها -->
          {#if s.items?.length}
            <span class="s-items">
              {#each s.items as it, ii (it.sku + '|' + ii)}
                <span class="s-item">
                  <span class="s-it-t">{saleItemLabel(it)}</span>
                  <span class="s-it-s">مقاس {it.size || '—'}</span>
                  <span class="s-it-q">×{fmtNum(it.qty)}</span>
                  <span class="s-it-p">{fmtIQD((Number(it.price) || 0) * (Number(it.qty) || 0))}</span>
                </span>
              {/each}
            </span>
          {/if}

          <!-- الذيل: مرجع الشحنة، ثم الإجمالي وزر الواتساب -->
          <span class="s-foot">
            <span class="s-tags">
              {#if s.barcode}<span class="s-tag">#{s.barcode}</span>{/if}
              {#if s.deliveryCompany}<span class="s-tag">{s.deliveryCompany}</span>{/if}
              {#if s.province}<span class="s-tag">{s.province}</span>{/if}
            </span>
            <span class="s-sum">
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
              <span class="money s-total">{fmtIQD(s.subtotal)}</span>
            </span>
          </span>
        </Glass>
      {/each}
      {#if logVisible < filtered.length}
        <div class="more-row">
          <button type="button" class="chip" onclick={() => (logVisible += LOG_STEP)}>
            عرض المزيد ({fmtNum(filtered.length - logVisible)} عملية)
          </button>
          <div bind:this={logSentinel} class="more-sentinel" aria-hidden="true"></div>
        </div>
      {/if}
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
        <div class="muted small">
          {fmtDate(detail.date)} · {fmtAgo(detail.date)}
          <button type="button" class="ts-edit" onclick={() => { saleTs = baghdadLocalInput(new Date(detail.date)); tsBox = !tsBox; buzz(6); }}>
            <Icon name="edit" size={10} /> عدّلي الوقت
          </button>
        </div>
        {#if tsBox}
          <div class="row" style="gap:8px; align-items:center">
            <input class="input ts-input" type="datetime-local" bind:value={saleTs} max={baghdadLocalInput()} style="flex:1; min-width:0" />
            <button class="btn primary" style="flex:none" onclick={saveTs}>حفظ</button>
          </div>
          <p class="muted tiny" style="margin:0">الوقت الجديد يسري على الخزنة وحركات المخزون وكل التقارير.</p>
        {/if}
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

      {#if detail.returnedFrom}
        <div class="muted small" style="display:flex; align-items:center; gap:6px">
          <Icon name="undo" size={13} /> راجع من العملية رقم {detail.returnedFrom} — قطعة واحدة منها أو أكثر
        </div>
      {/if}

      {#if detail.status !== 'returned' && (detail.items?.length || 0) > 1}
        <p class="muted tiny" style="margin:0">
          وصل الطلب ناقصاً؟ اضغطي على أي قطعة لتحويلها إلى «راجع» — تُفصل وحدها وتعود للمخزون،
          والباقي يبقى مُسلَّماً في هذه العملية.
        </p>
      {/if}

      <div class="stack" style="gap:8px">
        {#each detail.items as it (it.sku)}
          {@const ph = photos[it.sku]?.photo}
          {@const ip = photos[it.sku]}
          {@const back = !!backSel[it.sku]}
          <Glass class="row it-row {back ? 'is-back' : ''}" style="padding:10px 12px; border-radius:var(--r-md); justify-content:space-between">
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
            <div class="col" style="align-items:flex-end; gap:5px">
              <div class="money small">{fmtIQD(it.price * it.qty)}</div>
              {#if detail.status !== 'returned'}
                <button
                  type="button"
                  class="ret-chip"
                  class:on={back}
                  onclick={() => toggleBack(it.sku)}
                  aria-pressed={back}
                >
                  <Icon name={back ? 'undo' : 'check'} size={11} />
                  {back ? 'راجع' : 'استلمت'}
                </button>
              {/if}
            </div>
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

      {#if detail.status !== 'returned' && backKeys.length}
        <Glass class="split-note">
          <span class="muted small">
            <b class="bold">{fmtNum(backPreview.count)} قطعة</b> ستُسجَّل «راجع»
            ({fmtIQD(backPreview.amount)}) وتعود للمخزون،
            وتبقى <b class="bold">{fmtNum(backPreview.keptCount)} قطعة</b> مُسلَّمة هنا.
          </span>
        </Glass>
        <button class="btn primary block" onclick={() => doPartialReturn(detail)}>
          <Icon name="check" size={17} /> تسليم المستلَم وإرجاع المختار
        </button>
        <button class="btn ghost block" onclick={() => (backSel = {})}>إلغاء التحديد</button>
      {:else if detail.status === 'pending'}
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
  .more-row { display: flex; justify-content: center; padding: 18px 0 28px; }
  .more-sentinel { height: 1px; width: 100%; }
  /* صف العملية: ثلاثة أقسام مكدّسة — الرأس (من ومتى والحالة)، القطع (سطر
     لكل قطعة)، والذيل (مرجع الشحنة والإجمالي). لم تعد كل معلومة محشورة في
     سطر واحد، والسحب أُزيل — الصف للقراءة فقط، والإجراءات في ورقة التفاصيل. */
  :global(.sale) {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 9px;
    padding: 12px 14px;
    cursor: pointer;
    text-align: right;
    width: 100%;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.sale:active) { transform: scale(0.98); }

  .s-head { display: flex; align-items: center; gap: 10px; }
  .s-ic {
    flex: none;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
    background: var(--accent-soft);
  }
  .s-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .s-name {
    font-weight: 800; font-size: 14.5px; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .s-when { font-size: 11px; font-weight: 700; color: var(--taupe); font-variant-numeric: tabular-nums; }

  .s-items {
    display: flex; flex-direction: column; gap: 3px;
    padding: 8px 10px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.42);
    border: 1px solid var(--line);
  }
  .s-item { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
  .s-it-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .s-it-s { flex: none; color: var(--taupe); }
  .s-it-q { flex: none; min-width: 26px; text-align: center; color: var(--burgundy); font-weight: 800; font-variant-numeric: tabular-nums; }
  .s-it-p { flex: none; min-width: 64px; text-align: left; font-weight: 800; font-variant-numeric: tabular-nums; }

  .s-foot { display: flex; align-items: center; gap: 10px; }
  .s-tags { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 6px; }
  .s-tag {
    font-size: 10px; font-weight: 800; color: var(--taupe);
    background: rgba(122, 46, 58, 0.06);
    border-radius: 999px; padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }
  .s-sum { flex: none; display: flex; align-items: center; gap: 8px; }
  .s-total { font-size: 15px; color: var(--burgundy); font-variant-numeric: tabular-nums; }
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
  .ts-edit {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: inherit; font-size: 10px; font-weight: 800;
    color: var(--burgundy);
    background: rgba(181, 73, 91, 0.09);
    border: none; border-radius: 999px;
    padding: 2px 8px; margin-inline-start: 5px; cursor: pointer;
  }
  .ts-edit:active { transform: scale(0.94); }
  .ts-input { direction: ltr; text-align: center; font-variant-numeric: tabular-nums; }

  /* ---- تسليم جزئي: زرّ حالة القطعة + تمييز الراجعة ---- */
  .ret-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 800;
    color: var(--taupe);
    background: rgba(122, 46, 58, 0.06);
    border: 1px solid var(--line-2);
    border-radius: 999px;
    padding: 3px 9px;
    cursor: pointer;
    white-space: nowrap;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.18s, color 0.18s, border-color 0.18s;
  }
  .ret-chip:active { transform: scale(0.92); }
  .ret-chip.on {
    color: #fff;
    background: linear-gradient(135deg, var(--burgundy), var(--burgundy-deep));
    border-color: transparent;
  }
  /* الصف نفسه يخفت قليلاً حين تُعلَّم قطعته راجعة */
  :global(.it-row.is-back) {
    border-color: rgba(181, 73, 91, 0.45) !important;
    background: rgba(181, 73, 91, 0.07) !important;
  }
  :global(.split-note) {
    padding: 11px 13px;
    border-color: rgba(181, 73, 91, 0.32) !important;
    background: rgba(181, 73, 91, 0.06) !important;
  }
</style>
