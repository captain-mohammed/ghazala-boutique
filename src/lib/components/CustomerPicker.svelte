<script>
  /* منتقي الزبونات — يطفو فوق كل شيء (فوق ورقة الإتمام نفسها)، لا يُضاف
     في آخر الصفحة. الورقة القديمة كانت صفّ شرائح بسقف 6 زبونات، بلا هاتف
     ولا بحث: اسمان متشابهان لا يُميَّزان، والزبونة السابعة غير موجودة.
     هنا: بحث، القائمة كاملة، وكل صف يحمل هاتفها وعدد عملياتها. */
  import { fly, fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { fmtNum } from '../utils.js';

  let {
    open = false,
    customers = [],
    selectedPhone = '',
    onpick = () => {},
    onclose = () => {},
    onsave = () => {}
  } = $props();

  let q = $state('');
  let addMode = $state(false);
  let nName = $state('');
  let nPhone = $state('');
  let searchEl = $state(null);
  let saving = $state(false);

  const digits = (v) => String(v || '').replace(/\D/g, '');
  const selDigits = $derived(digits(selectedPhone));

  /* البحث بالاسم أو أرقام الهاتف — تُكتب 07xx أو 7xx، كلاهما يطابق */
  const list = $derived.by(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    const sd = digits(s);
    return customers.filter((c) => {
      if ((c.name || '').toLowerCase().includes(s)) return true;
      if (!sd) return false;
      return digits(c.phone).includes(sd) || digits(c.phone).replace(/^0+/, '').includes(sd.replace(/^0+/, ''));
    });
  });

  const isSel = (c) => selDigits.length > 0 && digits(c.phone) === selDigits;
  const initial = (c) => (c.name || 'ز').trim().charAt(0);
  const AV = ['#B5495B', '#A4803E', '#8A6A4F', '#7A2E3A', '#9C7B6B', '#6B7A8A'];
  const avColor = (c) => AV[(c.key || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV.length];

  /* إعادة الضبط عند كل فتح — تُفصَل عن التركيز حتى لا يعتمد أحدهما على الآخر */
  $effect(() => {
    if (!open) return;
    q = '';
    addMode = false;
    nName = '';
    nPhone = '';
  });

  $effect(() => {
    if (!open) return;
    const t = setTimeout(() => searchEl?.focus(), 240);
    return () => clearTimeout(t);
  });

  function pick(c) {
    onpick(c);
    onclose();
  }

  async function saveNew() {
    if (saving) return;
    if (!nName.trim() && !nPhone.trim()) return;
    saving = true;
    try {
      await onsave({ name: nName.trim(), phone: nPhone.trim() });
      addMode = false;
      nName = '';
      nPhone = '';
    } finally {
      saving = false;
    }
  }

  /* بحث بلا نتيجة؟ الاقتراح الجاهز: أضيفيها — والبحث يُعبّي الحقول */
  function addFromQuery() {
    const s = q.trim();
    if (digits(s).length >= 7 && digits(s).length === s.replace(/[\s-]/g, '').length) {
      nPhone = s;
      nName = '';
    } else {
      nName = s;
      nPhone = '';
    }
    addMode = true;
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) onclose(); }} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="cp-back" transition:fade={{ duration: 170 }} onclick={onclose}></div>

  <div class="cp-wrap">
    <div class="cp-card" in:fly={{ y: 26, duration: 260 }} out:fly={{ y: 18, duration: 170 }}>
      <div class="cp-grip"></div>

      <header class="cp-head">
        <span class="cp-ic"><Icon name="user" size={17} color="var(--burgundy)" /></span>
        <span class="cp-h">
          <b>زبونات محفوظات</b>
          <i>{fmtNum(customers.length)} زبونة · لمسة وتتعبى</i>
        </span>
        <button class="cp-x" aria-label="إغلاق" onclick={onclose}><Icon name="x" size={17} /></button>
      </header>

      <div class="cp-search">
        <Icon name="search" size={16} color="var(--taupe)" />
        <input
          bind:this={searchEl}
          bind:value={q}
          placeholder="ابحثي بالاسم أو رقم الهاتف…"
          autocomplete="off"
          inputmode="search"
        />
        {#if q}
          <button class="cp-clear" aria-label="مسح" onclick={() => (q = '')}><Icon name="x" size={12} /></button>
        {/if}
      </div>

      <div class="cp-list noscroll">
        {#each list as c (c.key)}
          <button class="cp-row" class:on={isSel(c)} onclick={() => pick(c)}>
            <span class="cp-av" style="background:{avColor(c)}">{initial(c)}</span>
            <span class="cp-main">
              <span class="cp-n">
                {c.name}
                {#if c.vip}<i class="cp-vip">VIP</i>{/if}
              </span>
              <span class="cp-p" dir="ltr">{c.phone || 'بلا رقم'}</span>
            </span>
            <span class="cp-ord" class:zero={!c.orders}>
              {c.orders ? `${fmtNum(c.orders)} عملية` : 'جديدة'}
            </span>
            {#if isSel(c)}<span class="cp-tick"><Icon name="check" size={13} color="#fff" /></span>{/if}
          </button>
        {:else}
          <div class="cp-empty">
            <Icon name="search" size={26} color="var(--taupe)" />
            <p>{q.trim() ? `لا زبونة تطابق «${q.trim()}»` : 'لا زبونات محفوظات بعد'}</p>
            {#if q.trim()}
              <button class="cp-addq" onclick={addFromQuery}>
                <Icon name="plus" size={14} /> أضيفيها كزبونة جديدة
              </button>
            {/if}
          </div>
        {/each}
      </div>

      <footer class="cp-foot">
        {#if addMode}
          <div class="cp-form">
            <input class="cp-in" bind:value={nName} placeholder="اسم الزبونة" />
            <input class="cp-in" bind:value={nPhone} inputmode="tel" placeholder="07xx…" dir="ltr" />
            <div class="cp-form-btns">
              <button class="cp-btn ghost" onclick={() => (addMode = false)}>إلغاء</button>
              <button class="cp-btn" onclick={saveNew} disabled={saving || (!nName.trim() && !nPhone.trim())}>
                {saving ? '…' : 'حفظ'}
              </button>
            </div>
          </div>
        {:else}
          <button class="cp-new" onclick={() => (addMode = true)}>
            <Icon name="plus" size={15} /> زبونة جديدة (بلا طلب)
          </button>
        {/if}
      </footer>
    </div>
  </div>
{/if}

<style>
  /* فوق أوراق التطبيق (60/61) وتحت التنبيهات (90) */
  .cp-back {
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(122, 46, 58, 0.26);
    backdrop-filter: blur(7px);
    -webkit-backdrop-filter: blur(7px);
  }
  .cp-wrap {
    position: fixed;
    inset: 0;
    z-index: 71;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: calc(9dvh + var(--sat)) 12px 12px;
    pointer-events: none;
  }
  .cp-card {
    pointer-events: auto;
    width: min(520px, 100%);
    max-height: 74dvh;
    display: flex;
    flex-direction: column;
    border-radius: 22px;
    border: 1px solid rgba(201, 161, 90, 0.4);
    background: linear-gradient(168deg, rgba(255, 253, 251, 0.985), rgba(251, 243, 238, 0.97));
    box-shadow:
      0 2px 0 rgba(255, 255, 255, 0.7) inset,
      0 30px 70px rgba(122, 46, 58, 0.34),
      0 8px 22px rgba(122, 46, 58, 0.16);
    overflow: hidden;
  }
  .cp-grip {
    width: 42px; height: 4px; border-radius: 3px;
    background: rgba(201, 161, 90, 0.5);
    margin: 9px auto 0; flex: none;
  }

  .cp-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px 8px;
    flex: none;
  }
  .cp-ic {
    flex: none;
    width: 36px; height: 36px;
    border-radius: 12px;
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1);
    border: 1px solid rgba(181, 73, 91, 0.16);
  }
  .cp-h { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cp-h b { font-size: 15px; font-weight: 900; color: var(--burgundy-deep); letter-spacing: -0.2px; }
  .cp-h i { font-size: 10.5px; font-weight: 700; font-style: normal; color: var(--taupe); }
  .cp-x {
    flex: none; width: 32px; height: 32px; border-radius: 10px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); background: rgba(255, 255, 255, 0.6);
    color: var(--taupe); cursor: pointer;
  }
  .cp-x:active { transform: scale(0.92); }

  .cp-search {
    flex: none;
    display: flex; align-items: center; gap: 8px;
    margin: 2px 16px 10px;
    padding: 0 12px;
    height: 44px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid var(--line-2);
  }
  .cp-search:focus-within { border-color: rgba(181, 73, 91, 0.45); box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.09); }
  .cp-search input {
    flex: 1; min-width: 0; border: none; background: none; outline: none;
    font-family: inherit; font-size: 14px; font-weight: 600; color: var(--ink);
  }
  .cp-search input::placeholder { color: var(--taupe); font-weight: 500; }
  .cp-clear {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; background: rgba(156, 123, 107, 0.16); color: var(--taupe); cursor: pointer;
  }

  .cp-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 8px;
    border: none;
    border-radius: 13px;
    background: none;
    text-align: start;
    cursor: pointer;
    font-family: inherit;
    color: var(--ink);
    transition: background 0.15s;
  }
  .cp-row:active { background: rgba(181, 73, 91, 0.07); }
  .cp-row.on { background: rgba(181, 73, 91, 0.09); box-shadow: inset 0 0 0 1px rgba(181, 73, 91, 0.22); }
  .cp-av {
    flex: none;
    width: 38px; height: 38px;
    border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    color: #fff; font-size: 15px; font-weight: 900;
    box-shadow: 0 2px 6px rgba(122, 46, 58, 0.2);
  }
  .cp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .cp-n {
    display: flex; align-items: center; gap: 6px;
    font-size: 13.5px; font-weight: 800; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cp-vip {
    flex: none;
    font-size: 8.5px; font-weight: 900; font-style: normal; letter-spacing: 0.4px;
    color: #7A5A1E;
    background: linear-gradient(150deg, rgba(201, 161, 90, 0.35), rgba(201, 161, 90, 0.2));
    border: 1px solid rgba(201, 161, 90, 0.5);
    border-radius: 999px;
    padding: 1px 6px;
  }
  .cp-p {
    font-size: 11.5px; font-weight: 700; color: var(--taupe);
    font-variant-numeric: tabular-nums;
    text-align: start;
    unicode-bidi: plaintext;
  }
  .cp-ord {
    flex: none;
    font-size: 10px; font-weight: 800;
    color: var(--burgundy);
    background: rgba(181, 73, 91, 0.1);
    border-radius: 999px;
    padding: 3px 8px;
    font-variant-numeric: tabular-nums;
  }
  .cp-ord.zero { color: var(--taupe); background: rgba(156, 123, 107, 0.13); }
  .cp-tick {
    flex: none; width: 20px; height: 20px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--burgundy);
  }

  .cp-empty {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 26px 16px 22px; text-align: center;
  }
  .cp-empty p { margin: 0; font-size: 12.5px; font-weight: 700; color: var(--taupe); }
  .cp-addq {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 2px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid rgba(181, 73, 91, 0.3);
    background: rgba(181, 73, 91, 0.08);
    color: var(--burgundy-deep);
    font-family: inherit; font-size: 12px; font-weight: 800;
    cursor: pointer;
  }

  .cp-foot {
    flex: none;
    padding: 9px 14px calc(10px + var(--sab));
    border-top: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.4);
  }
  .cp-new {
    width: 100%;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 40px;
    border-radius: 12px;
    border: 1px dashed rgba(181, 73, 91, 0.38);
    background: rgba(181, 73, 91, 0.05);
    color: var(--burgundy-deep);
    font-family: inherit; font-size: 12.5px; font-weight: 800;
    cursor: pointer;
  }
  .cp-form { display: flex; flex-direction: column; gap: 7px; }
  .cp-in {
    height: 40px;
    padding: 0 12px;
    border-radius: 11px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.85);
    font-family: inherit; font-size: 13px; font-weight: 600; color: var(--ink);
    outline: none;
  }
  .cp-in:focus { border-color: rgba(181, 73, 91, 0.45); }
  .cp-form-btns { display: flex; gap: 7px; }
  .cp-btn {
    flex: 1;
    height: 40px;
    border-radius: 11px;
    border: none;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    color: #fff;
    font-family: inherit; font-size: 12.5px; font-weight: 800;
    cursor: pointer;
  }
  .cp-btn:disabled { opacity: 0.45; }
  .cp-btn.ghost {
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid var(--line);
    color: var(--ink-2);
  }
</style>
