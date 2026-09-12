<script>
  
  import Icon from '../components/Icon.svelte';
  import Ticker from '../components/Ticker.svelte';
  import Logo from '../components/Logo.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import TargetRing from '../components/TargetRing.svelte';
  import { db, allSettings, upcomingOccasions, vaultState, vaultManual, archivedModels, getSetting, setSetting } from '../db.js';
  import { fmtIQD, fmtNum, isSameDay, daysAgoStart, lastSaleMap, salePieces, fmtDate, buzz, baghdadDayKey, baghdadMonthKey, monthRange, dayLabelFromKey, stockArrival, shelfAgeDays } from '../utils.js';
  import { spotlight, tilt } from '../motion.js';
  import Sheet from '../components/Sheet.svelte';
  import { invoicePreset, sellPrefill, toastOk, toastErr, celebrateAt } from '../store.js';
  import { sparkFromRect } from '../motion.js';

  /* tilt for Glass-hosted alert buttons (Glass applies it via its action prop) */
  const tiltAlert = (node) => tilt(node, { max: 5, scale: 1.01 });

  let { goto } = $props();

  let products = $state([]);
  let sales = $state([]);
  let settings = $state(null);
  let loaded = $state(false);
  let occasions = $state([]);
  let reservations = $state([]);
  let vault = $state(null);
  let moods = $state(null); // seasonMoods map — refreshed with the grab loop
  let customMoods = $state([]); // كلمات المزاج من عند المستونة فقط

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const [p, s, r, v, sm, mc, st] = await Promise.all([
        db.products.toArray(), db.sales.toArray(), db.reservations.toArray(), vaultState(),
        getSetting('seasonMoods', null), getSetting('moodCustom', []), allSettings()
      ]);
      if (!alive) return;
      products = p;
      sales = s;
      reservations = r.filter((x) => x.status === 'active');
      vault = v;
      moods = sm && typeof sm === 'object' ? sm : {};
      customMoods = Array.isArray(mc) ? mc : [];
      /* الإعدادات حيّة مع كل جلب — الهدف والرکود والمدينة القديمة وصحة النسخة
         تتحدث لحظياً بدل أن تنتظر إعادة تشغيل */
      settings = st;
      loaded = true;
    };
    grab();
    const t = setInterval(grab, 4000);
    return () => { alive = false; clearInterval(t); };
  });

  $effect(() => {
    let alive = true;
    upcomingOccasions(7).then((o) => { if (alive) occasions = o; });
    const t = setInterval(() => upcomingOccasions(7).then((o) => { if (alive) occasions = o; }), 60000);
    return () => { alive = false; clearInterval(t); };
  });

  /* ---- مزاج الموسم: كل كلمة لها لونها ورمزها واحتفالها ---- */
  const MOODS = [
    { label: 'هادي', hex: '#9c7b6b', emoji: '🌿', t: 'rgba(156,123,107,0.10)' },
    { label: 'أعراس', hex: '#b5495b', emoji: '💍', t: 'rgba(181,73,91,0.12)' },
    { label: 'رمضان', hex: '#c9a15a', emoji: '🌙', t: 'rgba(201,161,90,0.14)' },
    { label: 'عيد', hex: '#3e6b4f', emoji: '✨', t: 'rgba(62,107,79,0.11)' },
    { label: 'صيف', hex: '#c07f3a', emoji: '☀️', t: 'rgba(192,127,58,0.12)' },
    { label: 'شتاء', hex: '#232c49', emoji: '❄️', t: 'rgba(35,44,73,0.10)' },
    { label: 'تخرج', hex: '#7a2e3a', emoji: '🎓', t: 'rgba(122,46,58,0.12)' }
  ];
  const monthKey = baghdadMonthKey(0);
  const moodNow = $derived(moods?.[monthKey] || null);
  /* كلماتها الخاصة تأخذ شخصيتها من اسمها — نفس الكلمة = نفس اللون دائماً */
  const CUSTOM_FACES = [
    { hex: '#c2586f', emoji: '💝', t: 'rgba(194,88,111,0.12)' },
    { hex: '#b8860b', emoji: '🌟', t: 'rgba(184,134,11,0.13)' },
    { hex: '#6b7f3e', emoji: '🍀', t: 'rgba(107,127,62,0.11)' },
    { hex: '#7d5ba6', emoji: '🦋', t: 'rgba(125,91,166,0.11)' },
    { hex: '#3e7a8a', emoji: '🌊', t: 'rgba(62,122,138,0.11)' },
    { hex: '#c0632e', emoji: '🔥', t: 'rgba(192,99,46,0.12)' }
  ];
  const moodFace = (label) => {
    const known = MOODS.find((m) => m.label === label);
    if (known) return known;
    let h = 0;
    for (const ch of String(label)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return CUSTOM_FACES[h % CUSTOM_FACES.length];
  };
  const moodDef = $derived(moodNow ? moodFace(moodNow) : null);
  const moodHex = $derived(moodDef?.hex || null);
  const moodEmoji = $derived(moodDef?.emoji || null);
  const moodTint = $derived(moodDef?.t || null);
  /* وميض احتفالي عند اختيار المزاج — الرمز ينطلق من الزر نفسه */
  let moodFx = $state(null); // { key, emoji, hex }
  async function setMood(label, evt) {
    const next = moods?.[monthKey] === label ? null : label; // same chip → clear
    moods = { ...moods, [monthKey]: next };
    await setSetting('seasonMoods', moods);
    buzz(next ? [12, 40, 12] : 8);
    if (next) {
      const def = moodFace(next);
      const emoji = def.emoji;
      const hex = def.hex;
      const r = evt?.currentTarget?.getBoundingClientRect();
      const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
      const y = r ? r.top : window.innerHeight / 2.5;
      celebrateAt(x, y - 8, emoji, { x, y });
      moodFx = { key: Date.now(), emoji, hex };
      setTimeout(() => (moodFx = null), 1400);
      toastOk(`مزاج ${monthLabel(monthKey)}: ${next} ${emoji}`);
    }
  }
  const lastMonthInsight = $derived.by(() => {
    const key = baghdadMonthKey(1);
    const [a, b] = monthRange(key);
    let pieces = 0;
    const types = new Map();
    for (const s of sales) {
      if (s.status === 'returned') continue;
      const d = new Date(s.date);
      if (d < a || d >= b) continue;
      pieces += salePieces(s);
      for (const it of s.items || []) {
        const p = products.find((x) => x.sku === it.sku);
        const t = p?.type || p?.category || 'أخرى';
        types.set(t, (types.get(t) || 0) + (Number(it.qty) || 0));
      }
    }
    if (pieces === 0) return null;
    const top = [...types.entries()].sort((x, y) => y[1] - x[1])[0];
    return { pieces, top: top ? top[0] : null };
  });

  function monthLabel(key) {
    const m = Number(key.split('-')[1]);
    return ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][m - 1] || '';
  }

  /* ---- المدينة القديمة: sold-out too long → quiet shelf, off the alerts ---- */
  const archived = $derived(
    settings ? archivedModels(products, settings.archiveDays ?? 30) : []
  );
  const archivedSkus = $derived(new Set(archived.flatMap((a) => a.items.map((x) => x.sku))));

  const todaySales = $derived(sales.filter((s) => s.status !== 'returned' && isSameDay(s.date)));
  const today = $derived({
    count: todaySales.length,
    total: todaySales.reduce((a, s) => a + s.subtotal, 0),
    profit: todaySales.reduce((a, s) => a + s.profit, 0)
  });

  /* موديل = one internal number across ALL its color×size cards; قطع = physical pieces.
     Archived (المدينة القديمة) pieces are excluded from the نفد alert count. */
  const stock = $derived({
    models: new Set(products.map((p) => p.modelId || `${(p.name || '').trim().toLowerCase()}|${p.category || ''}`)).size,
    units: products.reduce((a, p) => a + (p.qty || 0), 0),
    value: products.reduce((a, p) => a + (p.qty || 0) * (p.cost || 0), 0),
    out: products.filter((p) => !p.qty && !archivedSkus.has(p.sku)).length
  });

  /* راكد = the CURRENT shelf stock has sat longer than the threshold, counted
     from its arrival (creation / last stock-in). Hours-old items show 0 يوم
     and only appear after the days chosen in الإعدادات. */
  const deadInfo = $derived.by(() => {
    if (!settings) return [];
    const lm = lastSaleMap(sales.filter((s) => s.status !== 'returned'));
    const cutoff = daysAgoStart(settings.deadStockDays ?? 30).getTime();
    return products
      .filter((p) => {
        if ((p.qty || 0) <= 0) return false;
        if (archivedSkus.has(p.sku)) return false; // المدينة القديمة — off the radar
        const since = stockArrival(p);
        const lastSold = lm.get(p.sku) ? new Date(lm.get(p.sku)).getTime() : 0;
        if (lastSold > since) return false;
        return since <= cutoff;
      })
      .map((p) => ({ p, days: shelfAgeDays(p) }))
      .sort((a, b) => b.days - a.days);
  });
  const dead = $derived(deadInfo.map((d) => d.p));

  /* ---- Smart suggestions: restock what flew off the shelf, discount what sits ---- */
  const weekSold = $derived.by(() => {
    const from = daysAgoStart(7);
    const map = new Map();
    for (const s of sales) {
      if (s.status === 'returned' || new Date(s.date) < from) continue;
      for (const it of s.items || []) map.set(it.sku, (map.get(it.sku) || 0) + (Number(it.qty) || 0));
    }
    return map;
  });
  const restock = $derived(
    products
      .filter((p) => p.qty === 0 && (weekSold.get(p.sku) || 0) >= 2)
      .sort((a, b) => (weekSold.get(b.sku) || 0) - (weekSold.get(a.sku) || 0))
      .slice(0, 2)
      .map((p) => ({ p, sold: weekSold.get(p.sku) || 0 }))
  );
  const smartOn = $derived(restock.length > 0);

  function goRestock(item) {
    const p = item.p;
    invoicePreset.set({
      supplier: p.supplier || '',
      lines: [{
        name: p.name, category: p.category, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '',
        color: p.color || '', cost: p.cost, price: p.price,
        sizes: { [String(p.size || '').trim() || '38']: 3 },
        photo: p.photo || null,
        modelId: p.modelId
      }]
    });
    buzz(10);
    goto('receive');
  }
  function goShowOff(p) {
    sellPrefill.set(p.name.trim());
    buzz(10);
    goto('sell');
  }

  /* ---- Streak badges — quiet little medals under the hero ---- */
  const dayPieces = $derived.by(() => {
    const m = new Map();
    for (const s of sales) {
      if (s.status === 'returned') continue;
      const k = baghdadDayKey(s.date);
      m.set(k, (m.get(k) || 0) + salePieces(s));
    }
    return m;
  });
  const bestDay = $derived.by(() => {
    const todayK = baghdadDayKey(new Date());
    const ym = todayK.slice(0, todayK.lastIndexOf('-'));
    let best = null;
    for (const [k, v] of dayPieces) if (k.startsWith(ym) && (!best || v > best.v)) best = { k, v };
    return best && best.v >= 3 ? best : null;
  });
  const streak = $derived.by(() => {
    let n = 0;
    for (let i = 0; i < 90; i++) {
      if ((dayPieces.get(baghdadDayKey(daysAgoStart(i))) || 0) > 0) n++;
      else if (i !== 0) break; // an in-progress today doesn't break the streak
    }
    return n;
  });
  /* Backup health: days since the last JSON export */
  const bkDays = $derived(settings?.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86400000) : null);
  const bkKind = $derived(bkDays === null ? 'none' : bkDays >= 14 ? 'bad' : bkDays >= 7 ? 'warn' : 'good');

  const recent = $derived([...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4));

  /* Money currently held by delivery companies (not yet settled) — بضعة البوتيك فقط */
  const transit = $derived(
    sales
      .filter((s) => s.status !== 'returned' && !s.settledAt)
      .reduce((a, s) => a + (Number(s.subtotal) || 0), 0)
  );
  const transitCount = $derived(sales.filter((s) => s.status !== 'returned' && !s.settledAt).length);

  /* ---- Daily briefing: one friendly morning line, parts assembled by importance ---- */
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير 🌸';
    if (h < 17) return 'مساء الخير 🌷';
    return 'مساء الخير 🌙';
  });
  const expiringRes = $derived(
    reservations.filter((r) => (new Date(r.expiresAt) - Date.now()) / 3600000 <= 12)
  );
  const briefing = $derived.by(() => {
    const parts = [];
    const y = daysAgoStart(1);
    const yNext = new Date(y.getTime() + 86400000);
    const yPieces = sales
      .filter((s) => s.status !== 'returned' && new Date(s.date) >= y && new Date(s.date) < yNext)
      .reduce((a, s) => a + salePieces(s), 0);
    if (yPieces > 0) parts.push(`البارحة بيعنا ${fmtNum(yPieces)} قطعة`);
    if (transit > 0) parts.push(`عند التوصيل ${fmtIQD(transit)}`);
    if (expiringRes.length > 0) parts.push(`${fmtNum(expiringRes.length)} حجز راح يخلص قريباً`);
    const occ = occasions[0];
    if (occ) parts.push(occ.inDays === 0 ? `مناسبة ${occ.customerName} اليوم 🎉` : `مناسبة ${occ.customerName} بعد ${fmtNum(occ.inDays)} يوم`);
    return parts;
  });

  /* One-shot border beam: runs only when a headline number actually changes,
     then removes itself — nothing loops on its own. */
  let beamOn = $state(false);
  let beamTimer;
  const headline = $derived(`${today.total}|${today.profit}|${stock.value}|${stock.units}`);
  let prevHeadline = headline;
  $effect(() => {
    if (headline === prevHeadline) { prevHeadline = headline; return; }
    prevHeadline = headline;
    beamOn = true;
    clearTimeout(beamTimer);
    beamTimer = setTimeout(() => (beamOn = false), 2500);
    return () => clearTimeout(beamTimer);
  });

  /* الهدف اليومي: the ring celebrates exactly once a day when it fills */
  const target = $derived(Number(settings?.dailyTarget) || 0);
  const todayPieces = $derived(
    sales.filter((s) => s.status !== 'returned' && isSameDay(s.date)).reduce((a, s) => a + salePieces(s), 0)
  );
  let ringDay = null;
  let ringLevel = 0;
  $effect(() => {
    if (!(target > 0) || todayPieces < target) return;
    const key = new Date().toDateString();
    if (ringDay !== key) { ringDay = key; ringLevel = 0; }
    if (ringLevel === 0) {
      ringLevel = 1;
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.8, '🎯');
      toastOk(`خمّصتي هدف اليوم! ${fmtNum(target)} قطعة 🎯`, 'success', 3600);
    }
  });

  /* الخزنة: celebrate once per goal-crossing (vaultState stamps it) */
  let vaultHeroEl = $state(null);
  $effect(() => {
    if (!vault?.justReached) return;
    celebrateAt(window.innerWidth / 2, window.innerHeight / 2.6, '👑');
    toastOk(`الخزنة وصلت ${fmtIQD(vault.goal)}! 🎉`, 'success', 4200);
    if (vaultHeroEl) sparkFromRect(vaultHeroEl, 22);
  });

  /* vault sheet state */
  let vaultOpen = $state(false);
  let vaultAmount = $state('');
  let vaultNote = $state('');
  async function vaultMove(kind) {
    const a = Math.round(Number(vaultAmount) || 0);
    if (a <= 0) { toastErr('اكتبي المبلغ أولاً'); return; }
    await vaultManual(kind, a, vaultNote.trim());
    vaultAmount = ''; vaultNote = '';
    toastOk(kind === 'in' ? 'أودعتِ في الخزنة 💰' : 'سُحب من الخزنة');
    buzz([10, 30, 10]);
  }
  async function restockArchived(a) {
    const p = a.rep;
    invoicePreset.set({
      supplier: p.supplier || '',
      lines: [{
        name: p.name, category: p.category, type: p.type || '', typeSub: p.typeSub || '', typeSub2: p.typeSub2 || '', typeSub3: p.typeSub3 || '',
        color: p.color || '', cost: p.cost, price: p.price,
        sizes: { [String(p.size || '').trim() || '38']: 3 },
        photo: p.photo || null,
        modelId: p.modelId
      }]
    });
    buzz(10);
    goto('receive');
  }

</script>

<div class="stack" style="gap:14px">
  <!-- Brand block: standalone on the aurora -->
  <header class="brand rise" style="animation-delay:0.03s">
    <Logo size={56} />
    <h1 class="h1">بوتيك غزالة</h1>
  </header>

  {#if loaded && briefing.length}
    <Glass class="brief rise" style="animation-delay:0.045s" onclick={() => { buzz(6); goto('reports'); }} role="button" tabindex="0">
      <span class="b-ic"><Icon name="sparkle" size={16} color="#fff" /></span>
      <div class="a-body">
        <div class="bold small">{greeting}</div>
        <div class="muted small">{briefing.join(' - ')}</div>
      </div>
    </Glass>
  {/if}

  <!-- مزاج الموسم: يظهر عندما يتنفس البوتيك — لا قبل أول موديل -->
  {#if loaded && products.length > 0}
    <Glass class="mood rise {moodTint ? 'washing' : ''}" style="animation-delay:0.05s; {moodTint ? `--mood-tint:${moodTint}; --mood-hex:${moodHex}` : ''}">
      {#if moodFx}
        {#key moodFx.key}
          <div class="mood-fx" style="--fx-hex:{moodFx.hex}">
            <span class="fx-ring"></span>
            <span class="fx-emoji">{moodFx.emoji}</span>
          </div>
        {/key}
      {/if}
      <div class="mood-head">
        <span class="mood-ic" class:beat={!!moodNow} style={moodHex ? `background:${moodHex}` : ''}><Icon name="flag" size={13} color="#fff" /></span>
        <span class="bold small">مزاج {monthLabel(monthKey)}</span>
        {#if moodNow}<span class="mood-word" style="color:{moodHex}">{moodEmoji} {moodNow}</span>{/if}
        {#if lastMonthInsight}
          <span class="muted tiny">الشهر الماضي بيعنا {fmtNum(lastMonthInsight.pieces)} قطعة{lastMonthInsight.top ? ` — أكثر شيوع: ${lastMonthInsight.top}` : ''}</span>
        {/if}
      </div>
      <div class="mood-chips">
        {#each customMoods as w (w)}
          <button
            class="mood-chip"
            class:active={moodNow === w}
            style={moodNow === w ? `background:${moodHex}; border-color:${moodHex}; color:#fff` : ''}
            onclick={(e) => setMood(w, e)}
          >{w}</button>
        {/each}
      </div>
    </Glass>
  {/if}

  {#if transit > 0}
    <Glass
      as="button"
      class="transit rise"
      style="animation-delay:0.06s; border-radius:var(--r-md)"
      onclick={() => { buzz(6); goto('ledger'); }}
    >
      <span class="tr-ic"><Icon name="truck" size={18} color="#fff" /></span>
      <div class="a-body">
        <div class="bold">عند شركات التوصيل: {fmtIQD(transit)}</div>
        <div class="muted small">{fmtNum(transitCount)} عملية — اضغطي للحساب والتسوية</div>
      </div>
      <Icon name="back" size={16} color="var(--taupe)" />
    </Glass>
  {/if}

  <Glass class="hero rise beam-host {beamOn ? 'beam-run' : ''}" style="animation-delay:0.03s; padding:18px">
    {#if target > 0}
      <div class="target-row">
        <div class="target-wrap">
          <TargetRing value={todayPieces} {target} size={52} stroke={4.5} />
          <span class="target-num" class:hit={todayPieces >= target}>{fmtNum(todayPieces)}</span>
        </div>
        <div class="target-text">
          <div class="bold small">هدف اليوم: {fmtNum(target)} قطعة</div>
          <div class="muted tiny">{todayPieces >= target ? 'تحققت الهدف اليوم 🎯' : `باقي ${fmtNum(Math.max(0, target - todayPieces))} قطعة`}</div>
        </div>
      </div>
    {/if}
    <div class="grid2">
      <div class="stat spot" use:spotlight>
        <div class="muted small">مبيعات اليوم</div>
        <div class="big"><Ticker value={today.total} /> <span class="cur">د.ع</span></div>
        <div class="muted small">{today.count} عملية بيع</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">ربح اليوم</div>
        <div class="big gold"><Ticker value={today.profit} /> <span class="cur">د.ع</span></div>
        <div class="muted small">صافي الربح</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">قيمة المخزون</div>
        <div class="big"><Ticker value={stock.value} /> <span class="cur">د.ع</span></div>
        <div class="muted small">بسعر التكلفة</div>
      </div>
      <div class="stat spot" use:spotlight>
        <div class="muted small">قطع المخزون</div>
        <div class="big"><Ticker value={stock.units} /></div>
        <div class="muted small">{stock.models} موديل</div>
      </div>
    </div>
  </Glass>

  <!-- خزنة الغزالة: كل بيعة تُسقّط ربحها في الخزنة بصمت -->
  {#if loaded && vault}
    <Glass
      bind:this={vaultHeroEl}
      as="button"
      class="vault rise"
      style="animation-delay:0.09s"
      onclick={() => { buzz(8); vaultOpen = true; }}
    >
      <span class="v-ic"><Icon name="wallet" size={18} color="#fff" /></span>
      <div class="a-body">
        <div class="bold">الخزنة: {fmtIQD(vault.balance)}</div>
        {#if vault.goal > 0}
          <div class="v-bar"><i style="width:{vault.balance > 0 ? Math.max(2, Math.min(100, (vault.balance / vault.goal) * 100)) : 0}%"></i></div>
          <div class="muted tiny">{vault.balance >= vault.goal ? 'الهدف تحقق — مبروك! 🎉' : `هدفها ${fmtIQD(vault.goal)}`}</div>
        {:else}
          <div class="muted tiny">أرباح كل المبيعات، بلا مصاريف</div>
        {/if}
      </div>
      <Icon name="back" size={16} color="var(--taupe)" />
    </Glass>
  {/if}

  {#if bestDay || streak >= 3 || bkKind === 'warn' || bkKind === 'bad' || bkKind === 'none'}
    <div class="medals">
      {#if bestDay}
        <button class="medal gold-medal" onclick={() => { buzz(6); goto('reports'); }} title="أحسن يوم هذا الشهر">
          <Icon name="sparkle" size={13} /> أحسن يوم: {fmtNum(bestDay.v)} قطعة — {dayLabelFromKey(bestDay.k)}
        </button>
      {/if}
      {#if streak >= 3}
        <span class="medal" title="أيام متتالية فيها بيع">
          <Icon name="flame" size={13} /> سلسلة {fmtNum(streak)} يوم
        </span>
      {/if}
      <button class="medal bk-{bkKind}" onclick={() => { buzz(6); goto('backup'); }} title="صحة النسخ الاحتياطي">
        <Icon name="shield" size={13} />
        {bkKind === 'none' ? 'لا نسخة بعد' : bkKind === 'bad' ? `نسخة منذ ${fmtNum(bkDays)} يوم` : bkKind === 'warn' ? `نسخة منذ ${fmtNum(bkDays)} يوم` : 'نسخة حديثة'}
      </button>
    </div>
  {/if}

  <section class="alerts">
    {#if smartOn}
      <Glass class="smart rise" style="animation-delay:0.08s">
        <h3 class="sm-head"><span class="sm-ic"><Icon name="sparkle" size={14} color="#fff" /></span> اقتراحات غزالة الذكية</h3>
        {#each restock as item (item.p.sku)}
          <div class="sm-row">
            <div class="a-body">
              <div class="bold small">{item.p.name}{item.p.size ? ` — مقاس ${item.p.size}` : ''}</div>
              <div class="muted tiny">نفد - بيع منه {fmtNum(item.sold)} قطعة هالأسبوع — فاضل تستلمين أكثر؟</div>
            </div>
            <button class="btn gold" style="min-height:38px; padding:0 12px; font-size:12.5px; flex:none" onclick={() => goRestock(item)}>
              <Icon name="upload" size={14} /> استلام
            </button>
          </div>
        {/each}
        {#each deadInfo.slice(0, 2) as d (d.p.sku)}
          <div class="sm-row">
            <div class="a-body">
              <div class="bold small">{d.p.name} — راكد {fmtNum(d.days)} يوم</div>
              <div class="muted tiny">{fmtNum(d.p.qty)} قطعة على الرف - اعرضيها بخصم، أفضل من رف ساكن</div>
            </div>
            <button class="btn" style="min-height:38px; padding:0 12px; font-size:12.5px; flex:none" onclick={() => goShowOff(d.p)}>
              <Icon name="cart" size={14} /> اعرضيها
            </button>
          </div>
        {/each}
      </Glass>
    {/if}
    {#if stock.out > 0 && !smartOn}
      <Glass
        as="button"
        class="alert rise"
        style="animation-delay:0.08s; border-radius:var(--r-md)"
        action={tiltAlert}
        onclick={() => goto('inventory')}
      >
        <span class="a-ic warn"><Icon name="alert" size={20} /></span>
        <div class="a-body">
          <div class="bold">{stock.out} موديل نفد من المخزون</div>
          <div class="muted small">اضغطي لمراجعة المخزون</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </Glass>
    {/if}
    {#if dead.length > 0 && !smartOn}
      <Glass
        as="button"
        class="alert rise"
        style="animation-delay:0.12s; border-radius:var(--r-md)"
        action={tiltAlert}
        onclick={() => goto('reports')}
      >
        <span class="a-ic dead"><Icon name="clock" size={20} /></span>
        <div class="a-body">
          <div class="bold">{dead.length} موديل بلا حركة منذ {settings?.deadStockDays ?? 30} يوم</div>
          <div class="muted small">شوفي تقرير المخزون الراكد</div>
        </div>
        <Icon name="back" size={18} color="var(--taupe)" />
      </Glass>
    {/if}
    {#if !smartOn && stock.out === 0 && dead.length === 0 && loaded && products.length > 0}
      <Glass class="alert rise" style="animation-delay:0.08s; border-radius:var(--r-md)">
        <span class="a-ic ok"><Icon name="check" size={20} /></span>
        <div class="a-body">
          <div class="bold">كل شيء تحت السيطرة</div>
          <div class="muted small">لا تنبيهات حالياً — ممتاز!</div>
        </div>
      </Glass>
    {/if}
  </section>

  <!-- المدينة القديمة: موديلات نفدت من زمان — رف هادي بعيد عن التنبيهات -->
  {#if loaded && archived.length > 0}
    <Glass class="rise" style="animation-delay:0.18s; padding:16px">
      <div class="row" style="justify-content:space-between; margin-bottom:8px">
        <h2 class="h2"><Icon name="clock" size={16} color="var(--taupe)" /> المدينة القديمة</h2>
        <span class="muted tiny">نفد من {fmtNum(settings?.archiveDays ?? 30)} يوم أو أكثر</span>
      </div>
      <div class="arch-row">
        {#each archived.slice(0, 6) as a (a.key)}
          {@const ph = a.rep.photo}
          <div class="arch-card">
            <span class="arch-thumb">{#if ph}<img src={ph} alt="" />{:else}<Icon name="image" size={18} color="var(--taupe)" />{/if}</span>
            <span class="muted tiny">{fmtNum(Math.floor((Date.now() - a.emptySince) / 86400000))} يوم</span>
            <button class="btn ghost arch-btn" onclick={() => restockArchived(a)}>أعيدي طلبي</button>
          </div>
        {/each}
      </div>
    </Glass>
  {/if}

  {#if recent.length}
    <Glass class="rise" style="animation-delay:0.2s; padding:16px">
      <div class="row" style="justify-content:space-between; margin-bottom:10px">
        <h2 class="h2">آخر العمليات</h2>
        <button class="btn ghost" style="min-height:36px; padding:0 12px" onclick={() => goto('saleslog')}>السجل الكامل</button>
      </div>
      <div class="stack" style="gap:8px">
        {#each recent as s, i (s.id)}
          <div class="sale-row pop" style="animation-delay:{0.2 + i * 0.06}s">
            <span class="s-ic"><Icon name={s.status === 'returned' ? 'undo' : 'cart'} size={18} color="var(--burgundy)" /></span>
            <div class="a-body">
              <div class="bold">{s.customerName || 'زبون'}</div>
              <div class="muted small">{fmtNum(salePieces(s))} قطعة</div>
              {#if s.items?.length}<VariantBits dense variants={s.items} />{/if}
            </div>
            <div class="money">{fmtIQD(s.subtotal)}</div>
          </div>
        {/each}
      </div>
    </Glass>
  {:else if loaded && products.length === 0}
    <div style="animation-delay:0.16s; margin-bottom:96px">
      <EmptyState
        title="ابدأ بجرد بوتيكك"
        subtitle="أضيفي أول حذاء من تبويب المخزون — كل شيء يبقى محفوظاً في جهازك"
        actionLabel="إضافة أول موديل"
        onaction={() => goto('inventory')}
      />
    </div>
  {/if}
</div>

<!-- Vault sheet: history + manual in/out -->
<Sheet open={vaultOpen} title="خزنة الغزالة" onclose={() => (vaultOpen = false)}>
  {#if vault}
    <div class="stack" style="gap:14px">
      <div class="v-sheet-top">
        <div class="muted small">الرصيد الحالي</div>
        <div class="v-balance">{fmtIQD(vault.balance)}</div>
        {#if vault.goal > 0}
          <div class="muted tiny">الهدف {fmtIQD(vault.goal)} — {vault.balance >= vault.goal ? 'تحقق 🎉' : `باقي ${fmtIQD(Math.max(0, vault.goal - vault.balance))}`}</div>
        {/if}
      </div>

      <div class="row" style="gap:8px">
        <input class="input" placeholder="مبلغ" bind:value={vaultAmount} inputmode="numeric" style="flex:1" />
        <input class="input" placeholder="سبب (اختياري)" bind:value={vaultNote} style="flex:2" />
      </div>
      <div class="row" style="gap:8px">
        <button class="btn primary block" onclick={() => vaultMove('in')}><Icon name="plus" size={15} /> إيداع</button>
        <button class="btn block" onclick={() => vaultMove('out')}><Icon name="x" size={15} /> سحب</button>
      </div>

      <div class="stack" style="gap:6px; max-height:280px; overflow-y:auto">
        {#each vault.entries.slice(0, 30) as e (e.id)}
          <div class="v-entry">
            <span class="v-dot" class:in={e.kind === 'in'}></span>
            <div class="a-body">
              <div class="small bold">{e.kind === 'in' ? '+' : '−'}{fmtIQD(e.amount)}</div>
              <div class="muted tiny">{e.note} - {fmtDate(e.date)}</div>
            </div>
          </div>
        {/each}
        {#if vault.entries.length === 0}
          <div class="muted small" style="text-align:center; padding:10px">الخزنة فاضية — أول بيعة تبدأها 💰</div>
        {/if}
      </div>
    </div>
  {/if}
</Sheet>

<style>  .brand {
    display: flex;
    align-items: center;
    justify-content: center; /* الشعار والاسم جنباً إلى جنب بمنتصف الصفحة */
    gap: 14px;
    padding: 4px 0 0;
  }
  .brand :global(.h1) { margin: 0; }

  :global(.transit) {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border-radius: var(--r-md);
    text-align: right; width: 100%; cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* ---- مزاج الموسم — Glass يرسم العنصر، فالقواعد عامة ---- */
  :global(.mood) { padding: 16px; border-radius: var(--r-lg); display: flex; flex-direction: column; gap: 8px; }
  :global(.mood-head) { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .mood-ic {
    width: 22px; height: 22px; border-radius: 7px;
    background: var(--taupe);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.3s ease;
  }
  .mood-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .mood-chip {
    font-family: inherit; font-size: 11.5px; font-weight: 800;
    color: var(--ink-2);
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 11px;
    cursor: pointer;
    transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
  }
  .mood-chip:active { transform: scale(0.92); }

  /* ---- انيميشن المزاج: غسلة لون حية + انفجار الرمز من الزر ---- */
  :global(.mood.washing) {
    position: relative;
    overflow: hidden;
  }
  :global(.mood.washing)::before {
    content: '';
    position: absolute; inset: -40%;
    background:
      radial-gradient(38% 55% at 25% 30%, var(--mood-tint), transparent 70%),
      radial-gradient(42% 58% at 78% 65%, var(--mood-tint), transparent 72%);
    animation: mood-aurora 7s ease-in-out infinite alternate;
    pointer-events: none;
  }
  @keyframes mood-aurora {
    0% { transform: translateX(-4%) rotate(-2deg) scale(1); opacity: 0.75; }
    50% { transform: translateX(4%) rotate(2deg) scale(1.08); opacity: 1; }
    100% { transform: translateX(-3%) rotate(-1deg) scale(1.04); opacity: 0.8; }
  }
  .mood-fx {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    z-index: 2;
  }
  .fx-ring {
    position: absolute; width: 70px; height: 70px; border-radius: 50%;
    border: 2.5px solid var(--fx-hex);
    opacity: 0.9;
    animation: fx-ring 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }
  @keyframes fx-ring {
    0% { transform: scale(0.3); opacity: 0.95; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  .fx-emoji {
    font-size: 34px;
    animation: fx-pop 1.1s cubic-bezier(0.22, 1.4, 0.36, 1) forwards;
    filter: drop-shadow(0 4px 14px rgba(58, 26, 32, 0.25));
  }
  @keyframes fx-pop {
    0% { transform: scale(0.4) translateY(6px); opacity: 0; }
    30% { transform: scale(1.25) translateY(0); opacity: 1; }
    70% { transform: scale(1) translateY(-6px); opacity: 1; }
    100% { transform: scale(0.9) translateY(-22px); opacity: 0; }
  }
  .mood-word {
    font-weight: 900; font-size: 12.5px;
    animation: word-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes word-in {
    from { opacity: 0; transform: translateY(5px) scale(0.9); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  :global(.mood-ic.beat) { animation: ic-beat 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes ic-beat {
    0%, 100% { transform: scale(1); }
    35% { transform: scale(1.28) rotate(-6deg); }
    65% { transform: scale(1.12) rotate(3deg); }
  }

  /* ---- الهدف اليومي ---- */
  .target-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .target-wrap { position: relative; flex: none; display: flex; align-items: center; justify-content: center; }
  .target-num {
    position: absolute; font-size: 13px; font-weight: 800; color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .target-num.hit { color: #8a6a35; }
  .target-text { display: flex; flex-direction: column; gap: 1px; }

  /* ---- خزنة الغزالة ---- */
  :global(.vault) {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 15px; border-radius: var(--r-md);
    text-align: right; width: 100%; cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.vault:active) { transform: scale(0.98); }
  .v-ic {
    flex: none; width: 40px; height: 40px; border-radius: 13px;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(122, 46, 58, 0.3);
  }
  .v-bar {
    height: 5px; border-radius: 999px; margin: 4px 0 3px;
    background: rgba(122, 46, 58, 0.12);
    overflow: hidden;
  }
  .v-bar i {
    display: block; height: 100%; border-radius: 999px;
    background: linear-gradient(90deg, var(--gold), #a4803e);
    transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .v-sheet-top { text-align: center; display: flex; flex-direction: column; gap: 2px; }
  .v-balance { font-size: 26px; font-weight: 800; color: var(--burgundy); }
  .v-entry { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: var(--r-sm); background: rgba(255, 255, 255, 0.35); border: 1px solid var(--line); }
  .v-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--taupe); }
  .v-dot.in { background: var(--good); }

  /* ---- المدينة القديمة ---- */
  .arch-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; }
  .arch-card {
    flex: none; width: 118px;
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 10px 8px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
  .arch-thumb {
    width: 56px; height: 56px; border-radius: 12px; overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(156, 123, 107, 0.1);
    filter: grayscale(0.35); opacity: 0.85;
  }
  .arch-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .arch-btn { min-height: 28px; padding: 0 10px; font-size: 11.5px; }

  :global(.brief) {
    display: flex; align-items: center; gap: 11px;
    padding: 11px 14px; border-radius: var(--r-md);
    cursor: pointer;
  }
  .b-ic {
    flex: none; width: 34px; height: 34px;
    border-radius: 11px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
  }
  :global(.transit:active) { transform: scale(0.98); }
  .tr-ic {
    flex: none; width: 40px; height: 40px;
    border-radius: 13px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 12px rgba(164, 128, 62, 0.3);
  }
  .a-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .stat {
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .big { font-size: 21px; font-weight: 800; color: var(--ink); display: flex; align-items: baseline; gap: 4px; }
  .big .cur { font-size: 11px; color: var(--taupe); font-weight: 700; }
  .big.gold { color: var(--gold); }

  .alerts { display: flex; flex-direction: column; gap: 10px; }
  :global(.alert) {
    display: flex; align-items: center; gap: 12px;
    padding: 13px 15px; border-radius: var(--r-md);
    text-align: right; width: 100%;
    cursor: pointer;
    transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  :global(.alert:active) { transform: scale(0.98); }
  .a-ic {
    flex: none;
    width: 40px; height: 40px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 13px;
  }
  .a-ic.warn { background: rgba(192, 127, 58, 0.14); color: var(--warn); }
  .a-ic.dead { background: var(--accent-soft); color: var(--burgundy); }
  .a-ic.ok { background: rgba(78, 138, 95, 0.12); color: var(--good); }
  .a-body { flex: 1; display: flex; flex-direction: column; gap: 1px; }

  .sale-row {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 10px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
  .s-ic {
    flex: none; width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 12px;
    background: var(--accent-soft);
  }

  :global(.smart) { padding: 13px 15px; display: flex; flex-direction: column; gap: 10px; }

  .medals { display: flex; flex-wrap: wrap; gap: 8px; margin-top: -4px; }
  .medal {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: inherit; font-size: 11.5px; font-weight: 800;
    color: var(--ink-2);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 11px;
  }
  button.medal { cursor: pointer; transition: transform 0.14s cubic-bezier(0.34, 1.56, 0.64, 1); }
  button.medal:active { transform: scale(0.94); }
  .gold-medal {
    color: #8a6a35;
    background: var(--gold-soft);
    border-color: rgba(201, 161, 90, 0.35);
  }
  .medal.bk-good { color: var(--good); }
  .medal.bk-warn { color: var(--warn); background: rgba(192, 127, 58, 0.12); border-color: rgba(192, 127, 58, 0.35); }
  .medal.bk-bad { color: #fff; background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep)); border-color: transparent; }
  .medal.bk-none { color: var(--burgundy-deep); background: var(--accent-soft); border-color: rgba(181, 73, 91, 0.3); }
  .sm-head {
    display: flex; align-items: center; gap: 8px;
    margin: 0; font-size: 14px; font-weight: 800; color: var(--ink);
  }
  .sm-ic {
    width: 24px; height: 24px; border-radius: 8px;
    background: linear-gradient(150deg, var(--gold), #a4803e);
    display: flex; align-items: center; justify-content: center;
  }
  .sm-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
</style>
