<script>
  import Icon from '../components/Icon.svelte';
  import Scanner from '../components/Scanner.svelte';
  import Glass from '../components/Glass.svelte';
  import VariantBits from '../components/VariantBits.svelte';
  import { db, stocktakeApply } from '../db.js';
  import { fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm, celebrateAt } from '../store.js';

  let products = $state([]);
  let counts = $state({}); // sku -> counted qty (string while typing)
  let q = $state('');
  let scanOpen = $state(false);
  let applying = $state(false);

  $effect(() => {
    let alive = true;
    const grab = async () => {
      const p = await db.products.toArray();
      if (alive) products = p;
    };
    grab();
    const t = setInterval(grab, 5000);
    return () => { alive = false; clearInterval(t); };
  });

  const countedEntries = $derived(Object.entries(counts).filter(([sku, v]) => v !== '' && v !== null));
  const diffCount = $derived(
    countedEntries.reduce((acc, [sku, v]) => {
      const p = products.find((x) => x.sku === sku);
      if (!p) return acc;
      const diff = (Number(v) || 0) - p.qty;
      return acc + (diff !== 0 ? 1 : 0);
    }, 0)
  );

  const filtered = $derived.by(() => {
    if (!q.trim()) return products.slice(0, 30);
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => [p.name, p.sku, p.color, p.size, p.barcode].filter(Boolean).join(' ').toLowerCase().includes(s))
      .slice(0, 40);
  });

  function onScan(code) {
    scanOpen = false;
    const p = products.find((x) => x.barcode === code || x.sku === code);
    if (!p) { toastErr('لا يوجد موديل بهذا الكود'); return; }
    counts = { ...counts, [p.sku]: counts[p.sku] ?? '' };
    q = p.sku;
    buzz(10);
    toastOk('حدّدي الكمية الفعلية للقطعة الممسوحة');
  }

  async function apply() {
    if (!diffCount) { toastErr('لا فروقات للتطبيق بعد'); return; }
    const ok = await askConfirm({
      title: 'تطبيق نتائج الجرد؟',
      body: `سيتم تعديل كميات ${diffCount} موديل حسب العدّ الفعلي وتسجيل الفروقات في سجل الحركات.`,
      okLabel: 'تطبيق'
    });
    if (!ok) return;
    applying = true;
    try {
      await stocktakeApply(
        countedEntries.map(([sku, v]) => ({ sku, counted: Math.max(0, Number(v) || 0) }))
      );
      counts = {};
      q = '';
      buzz([30, 60, 30]);
      celebrateAt(window.innerWidth / 2, window.innerHeight / 2.6, '✅');
      toastOk('تم تطبيق الجرد بنجاح');
    } finally {
      applying = false;
    }
  }
</script>

<div class="stack" style="gap:12px">
  <div class="row" style="gap:10px">
    <Glass class="search" radius="var(--r-md)">
      <Icon name="search" size={18} color="var(--taupe)" />
      <input placeholder="ابحث عن موديل لعدّه…" bind:value={q} />
    </Glass>
    <button class="iconbtn" style="width:50px; height:50px; flex:none" aria-label="مسح" onclick={() => { buzz(8); scanOpen = true; }}>
      <Icon name="scan" size={20} />
    </button>
  </div>

  <Glass style="padding:12px 16px; display:flex; align-items:center; gap:10px">
    <Icon name="check" size={18} color="var(--good)" />
    <span class="small muted" style="flex:1">عدّيت {fmtNum(countedEntries.length)} موديل • فروقات: <b style="color:{diffCount ? 'var(--warn)' : 'var(--good)'}">{fmtNum(diffCount)}</b></span>
    <button class="btn primary" style="min-height:42px" onclick={apply} disabled={applying || !diffCount}>تطبيق الجرد</button>
  </Glass>

  <div class="stack" style="gap:8px; padding-bottom:80px">
    {#each filtered as p (p.sku)}
      {@const counted = counts[p.sku]}
      {@const diff = counted !== undefined && counted !== '' ? (Number(counted) || 0) - p.qty : null}
      <Glass class="row {counted !== undefined ? 'mark' : ''}" style="padding:10px 12px; border-radius:var(--r-md); gap:10px">
        <span class="st-thumb">{#if p.photo}<img src={p.photo} alt="" />{:else}<Icon name="image" size={16} color="var(--taupe)" />{/if}</span>
        <div style="flex:1; min-width:0">
          <div class="muted small">
            <VariantBits dense variants={[{ color: p.color, size: p.size }]} />
          </div>
          <div class="muted small">
            المتوقع: {fmtNum(p.qty)}
            {#if diff !== null && diff !== 0}
              <span class="diff" class:neg={diff < 0} class:pos={diff > 0}>
                ({diff > 0 ? '+' : ''}{fmtNum(diff)})
              </span>
            {/if}
          </div>
        </div>
        <input
          class="input cinput"
          type="number"
          min="0"
          inputmode="numeric"
          placeholder="العدّ"
          value={counted ?? ''}
          oninput={(e) => (counts = { ...counts, [p.sku]: e.currentTarget.value })}
        />
      </Glass>
    {/each}
  </div>
</div>

<Scanner open={scanOpen} title="جرد — مسح موديل" onclose={() => (scanOpen = false)} onscan={onScan} />

<style>
  :global(.search) {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    height: 50px;
    border-radius: var(--r-md);
  }
  :global(.search) input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
  }
  :global(.row.mark) { border-color: rgba(181, 73, 91, 0.35); background: rgba(181, 73, 91, 0.05); }
  .st-thumb {
    flex: none;
    width: 42px; height: 42px;
    border-radius: 11px;
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid var(--line);
  }
  .st-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .cinput { width: 90px; min-height: 44px; text-align: center; flex: none; }
  .diff { font-weight: 800; }
  .diff.pos { color: var(--good); }
  .diff.neg { color: var(--burgundy); }
</style>
