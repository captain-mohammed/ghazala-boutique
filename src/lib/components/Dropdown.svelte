<script module>
  /* قائمة واحدة مفتوحة في التطبيق — مشترك بين كل نسخ Dropdown */
  let activeClose = null;
</script>

<script>
  /* Dropdown — قائمة فلاتر واحدة لكل التطبيق (المخزون + بيع فقط).

     ⚠️ لماذا تُرسم كلوحة أسفل **بطاقة الفلاتر** لا أسفل الزر نفسه:
     على شاشة الهاتف كل فلتر في سطر كامل، فالقائمة الملتصقة بالزر كانت تغطي
     الأزرار الثلاثة التي تحته. اللمسة تُحتسب على القائمة لا على الزر (الـ
     hit-test يقع قبل أي إغلاق)، فتبدو القائمة «لم تُفتح» — وأحياناً يُختار
     فلتر آخر بلا قصد. اللوحة تحت البطاقة كلها لا تغطي أي زر فلتر، فأي ضغطة
     على فلتر آخر تصل إليه فعلاً. */
  import { fly } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';

  let {
    value = $bindable(''),
    options = [], // [{ value, label, count? }]
    icon = 'chev',
    placeholder = 'الكل',
    onselect = () => {}
  } = $props();

  let open = $state(false);
  let style = $state('');
  let root = $state(null);

  const current = $derived(options.find((o) => o.value === value));

  function pick(v) {
    value = v;
    buzz(6);
    close();
    onselect(v);
  }

  function close() {
    open = false;
    if (activeClose === close) activeClose = null;
  }

  /* اللوحة تُثبَّت تحت حاوية الفلاتر (أو تحت الزر إن لم توجد)، وتُقلب لأعلى
     إن لم يبقَ مكان أسفلها، وتُقصّ على حدود الشاشة. */
  function place() {
    if (!root) return;
    const host = root.closest('[data-dd-host]') || root;
    const r = host.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const want = Math.min(options.length * 42 + 14, 300);
    const flip = below < Math.min(want, 180) && above > below;
    const width = Math.max(160, Math.min(r.width, vw - 20));
    const left = Math.max(10, Math.min(r.left, vw - width - 10));
    const room = Math.max(140, Math.min(want, flip ? above : below));
    style = flip
      ? `left:${left}px; width:${width}px; bottom:${Math.round(vh - r.top + 6)}px; max-height:${Math.round(room)}px`
      : `left:${left}px; width:${width}px; top:${Math.round(r.bottom + 6)}px; max-height:${Math.round(room)}px`;
  }

  function toggle() {
    if (open) { close(); return; }
    buzz(5);
    activeClose?.();
    place();
    open = true;
    activeClose = close;
  }

  /* ضغطة خارج القائمة تُغلقها في طور الالتقاط — قبل أن تصل إلى الزر التالي */
  function onDocDown(e) {
    if (!open) return;
    if (root?.contains(e.target)) return;      /* زر هذا الفلتر */
    if (e.target?.closest?.('.dd-pop')) return; /* اللوحة نفسها */
    close();
  }
  /* اللوحة مثبتة بإحداثيات الشاشة: تمرير الصفحة يفصلها عن بطاقة الفلاتر —
     تُغلق بدل أن تطفو في مكان لا يخصّها (تمرير اللوحة نفسها لا يغلقها) */
  function onAnyScroll(e) {
    if (!open) return;
    if (e.target?.closest?.('.dd-pop')) return;
    close();
  }
  $effect(() => {
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('scroll', onAnyScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('scroll', onAnyScroll, true);
      if (activeClose === close) activeClose = null;
    };
  });

  /* اللوحة تُنقل إلى body — خارج أي حاوية تقصّ position:fixed */
  function portal(el) {
    document.body.appendChild(el);
    return { destroy: () => el.remove() };
  }
</script>

<div class="dd" bind:this={root}>
  <button class="dd-btn" class:active={!!current && !current.clear} onclick={toggle} aria-expanded={open}>
    <span class="dd-ic"><Icon name={current && !current.clear ? (current.icon || icon) : icon} size={15} /></span>
    <span class="dd-label">{current && !current.clear ? current.label : placeholder}</span>
    <span class="dd-chev" class:flip={open}><Icon name="back" size={13} /></span>
  </button>
</div>

{#if open}
  <div class="dd-pop glass-strong" use:portal style={style} transition:fly={{ y: 6, duration: 200, opacity: 1, easing: backOut }}>
    {#each options as o (o.value)}
      <button class="dd-opt" class:sel={o.value === value && !o.clear} onclick={() => pick(o.value)}>
        <span class="dd-opt-ic"><Icon name={o.icon || 'check'} size={15} color={o.value === value && !o.clear ? 'var(--burgundy)' : 'var(--taupe)'} /></span>
        <span class="dd-opt-label">{o.label}</span>
        {#if o.count != null}<span class="dd-opt-n">{o.count}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .dd { position: relative; flex: 1; min-width: 0; }
  .dd-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--line-2);
    background: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .dd-btn:hover, .dd-btn.active { border-color: rgba(181, 73, 91, 0.35); background: rgba(255, 255, 255, 0.75); }
  .dd-btn.active { box-shadow: 0 0 0 3px rgba(181, 73, 91, 0.1); }
  .dd-ic { display: inline-flex; color: var(--burgundy); flex: none; }
  .dd-label {
    flex: 1;
    min-width: 0;
    text-align: right;
    font-size: 13px;
    font-weight: 800;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dd-chev { display: inline-flex; color: var(--taupe); transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); transform: rotate(90deg); }
  .dd-chev.flip { transform: rotate(-90deg); }

  /* اللوحة: مثبتة بإحداثيات الشاشة، تحت بطاقة الفلاتر — لا تغطي أي فلتر */
  .dd-pop {
    position: fixed;
    z-index: 70;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: rgba(255, 251, 247, 0.92);
    backdrop-filter: blur(28px) saturate(1.6);
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    border: 1px solid rgba(201, 161, 90, 0.35);
    border-radius: var(--r-md);
    box-shadow: 0 22px 54px rgba(58, 26, 32, 0.3), 0 2px 0 rgba(255, 255, 255, 0.6) inset;
  }
  .dd-opt {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 11px;
    border: none;
    background: none;
    border-radius: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: right;
    transition: background 0.15s;
    flex: none;
  }
  .dd-opt:hover { background: var(--accent-soft); }
  .dd-opt.sel { background: var(--accent-soft); }
  .dd-opt-ic { display: inline-flex; flex: none; }
  .dd-opt-label {
    flex: 1;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dd-opt-n {
    font-size: 11px;
    font-weight: 800;
    color: var(--taupe);
    background: rgba(122, 46, 58, 0.08);
    padding: 2px 7px;
    border-radius: 999px;
  }
</style>
