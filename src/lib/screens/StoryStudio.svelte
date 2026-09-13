<script>
  /* استوديو القصص — حوّلي أي موديل إلى محتوى جاهز للنشر:
     منشور (تعليق + هاشتاغات) وقصة إنستغرام، بخطوة واحدة.
     الصورة تُفتح من التطبيق نفسه، والنصوص تُنسخ/تُشارك بواتساب. */
  import { onMount } from 'svelte';
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Sheet from '../components/Sheet.svelte';
  import { db } from '../db.js';
  import { fmtIQD, fmtNum, fmtDate, buzz, copyText, sendWhatsApp } from '../utils.js';
  import { toastOk } from '../store.js';

  let products = $state([]);
  let openPost = $state(null); // الموديل المفتوح حالياً
  let caption = $state('');
  let story = $state('');
  let hashtags = $state('');
  let loading = $state(true);

  onMount(load);
  async function load() {
    loading = true;
    const prods = await db.products.toArray();
    /* group by modelId — keep newest */
    const map = new Map();
    for (const p of prods) {
      if (!map.has(p.modelId) || new Date(p.createdAt) > new Date(map.get(p.modelId).createdAt)) map.set(p.modelId, p);
    }
    products = [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 30);
    loading = false;
  }

  const mSize = (p) => (p.size ? String(p.size) : '');
  const mColors = (p) => {
    const map = new Map();
    for (const x of products.filter((q) => q.modelId === p.modelId)) {
      if (x.color && !map.has(x.color)) map.set(x.color, x.qty || 0);
    }
    return map;
  };
  const chainOf = (p) => [p.type, p.typeSub, p.typeSub2, p.typeSub3].filter(Boolean).join(' - ') || 'موديل جديد';

  function compose(p) {
    buzz(8);
    openPost = p;
    const sizes = [...new Set(products.filter((q) => q.modelId === p.modelId && q.qty > 0).map((q) => String(q.size || '').trim()).filter(Boolean))].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    const colors = [...mColors(p).keys()];
    const sTxt = sizes.length ? sizes.join('، ') : mSize(p) || '—';
    const cTxt = colors.length ? colors.join('، ') : '';
    const scarce = p.qty > 0 && p.qty <= 3;
    caption =
      `✨ وصل جديد ${'غزالة'} ✨\n\n` +
      `${chainOf(p)}${cTxt ? `\nالألوان: ${cTxt}` : ''}${sizes.length ? `\nالمقاسات: ${sTxt}` : ''}\n` +
      `السعر: ${fmtIQD(p.price)}\n\n` +
      (scarce ? `⚠️ الكمية محدودة — ${fmtNum(p.qty)} قطع فقط!\n` : '') +
      `للطلب: راسلينا واتساب 💬`;
    story =
      `جديدنا وصل 👀\n${chainOf(p)} — ${fmtIQD(p.price)}\n` +
      (sizes.length ? `المقاسات: ${sTxt}\n` : '') +
      `اسحبي فوق للطلب 💬`;
    hashtags = '#بوتيك_غزالة #أحذية_نسائية #جديدنا #موضة_عراقية #بغداد';
  }
  async function copyWhich(which) {
    const text = which === 'cap' ? caption : which === 'story' ? story : hashtags;
    const ok = await copyText(text);
    if (ok) toastOk('تم النسخ — الصقيها في إنستغرام 📋');
  }
  async function shareAll() {
    const all = `${caption}\n\n${hashtags}`;
    const { opened } = await sendWhatsApp(all, '');
    if (opened) toastOk('فُتح واتساب — ارسليها لنفسك ثم انسخيها 💬');
  }
  const openInsta = () => window.open('https://www.instagram.com/', '_blank');
</script>

<div class="stack" style="gap:12px">
  <Glass class="hero rise" style="padding:16px">
    <div class="row" style="justify-content:space-between; align-items:center">
      <div>
        <h1 class="h1">استوديو القصص</h1>
        <div class="muted small">اختاري موديلاً — نجهز لك التعليق والقصة والهاشتاغات</div>
      </div>
      <span class="hero-ic"><Icon name="image" size={22} color="var(--burgundy)" /></span>
    </div>
  </Glass>

  {#if loading}
    <div class="muted small" style="text-align:center; padding:30px">…جاري التجهيز</div>
  {:else if !products.length}
    <EmptyState title="لا موديلات بعد" body="سجلي موديلاتك — وكل موديل يصير منشور وقصة جاهزين" icon="image" />
  {:else}
    <div class="wall">
      {#each products as p, i (p.modelId)}
        <button class="tile glass rise" style="animation-delay:{Math.min(i * 0.04, 0.3)}s" onclick={() => compose(p)}>
          {#if p.photo}
            <img src={p.photo} alt="" loading="lazy" />
          {:else}
            <span class="noimg"><Icon name="image" size={20} color="var(--taupe)" /></span>
          {/if}
          <span class="t-chain">{chainOf(p)}</span>
          <span class="t-price">{fmtIQD(p.price)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<Sheet open={!!openPost} title="استوديو القصص" onclose={() => (openPost = null)}>
  {#if openPost}
    <div class="stack" style="gap:12px">
      <Glass style="padding:12px">
        <div class="row" style="gap:12px; align-items:center">
          {#if openPost.photo}
            <img class="prev" src={openPost.photo} alt="" />
          {:else}
            <span class="prev noimg2"><Icon name="image" size={22} color="var(--taupe)" /></span>
          {/if}
          <div>
            <b class="small">{chainOf(openPost)}</b>
            <div class="muted tiny">وصل {fmtDate(openPost.createdAt)} — {fmtIQD(openPost.price)}</div>
          </div>
        </div>
      </Glass>

      <div>
        <div class="lrow"><span class="lab">التعليق (منشور)</span><button class="copy" onclick={() => copyWhich('cap')}><Icon name="file" size={12} /> نسخ</button></div>
        <textarea class="msg" rows="7" bind:value={caption}></textarea>
      </div>
      <div>
        <div class="lrow"><span class="lab">الهاشتاغات</span><button class="copy" onclick={() => copyWhich('tags')}><Icon name="file" size={12} /> نسخ</button></div>
        <textarea class="msg" rows="2" bind:value={hashtags}></textarea>
      </div>
      <div>
        <div class="lrow"><span class="lab">نص القصة</span><button class="copy" onclick={() => copyWhich('story')}><Icon name="file" size={12} /> نسخ</button></div>
        <textarea class="msg" rows="3" bind:value={story}></textarea>
      </div>

      <div class="row" style="gap:8px">
        <button class="btn gold block" style="min-height:44px" onclick={shareAll}>
          <Icon name="whatsapp" size={15} /> شاركي بالواتساب
        </button>
        <button class="btn primary block" style="min-height:44px" onclick={openInsta}>
          <Icon name="image" size={15} /> افتحي إنستغرام
        </button>
      </div>
      <div class="muted tiny" style="text-align:center">انسخي النص، افتحي إنستغرام، والصورة جاهزة في المعرض 📸</div>
    </div>
  {/if}
</Sheet>

<style>
  .hero-ic {
    width: 44px; height: 44px; border-radius: 14px; flex: none;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1); border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .wall { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9px; }
  .tile {
    position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden;
    padding: 0; cursor: pointer; border: 1px solid var(--line-2);
    display: flex; align-items: center; justify-content: center;
  }
  .tile img { width: 100%; height: 100%; object-fit: cover; }
  .noimg { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.4); }
  .t-chain {
    position: absolute; inset-inline: 6px; bottom: 22px;
    font-size: 10px; font-weight: 800; color: #fff;
    text-shadow: 0 1px 6px rgba(0, 0, 0, 0.55); text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .t-price {
    position: absolute; inset-inline: 6px; bottom: 6px;
    font-size: 10.5px; font-weight: 800; color: var(--gold);
    text-shadow: 0 1px 5px rgba(0, 0, 0, 0.6); text-align: center;
  }
  .prev { width: 58px; height: 58px; border-radius: 12px; object-fit: cover; flex: none; }
  .noimg2 { display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.5); border: 1px dashed var(--line-2); }
  .lrow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .lab { font-size: 12px; font-weight: 800; color: var(--ink-2); }
  .copy {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: inherit; font-size: 10.5px; font-weight: 800;
    color: var(--burgundy); background: rgba(181, 73, 91, 0.08);
    border: none; border-radius: 999px; padding: 4px 10px; cursor: pointer;
  }
  .copy:active { transform: scale(0.95); }
  .msg { width: 100%; border: 1px dashed var(--line-2); border-radius: 12px; background: rgba(255, 255, 255, 0.6); font-family: inherit; font-size: 13px; color: var(--ink); padding: 10px; resize: vertical; }
</style>
