<script>
  /* Pick — قائمة اختيار فريدة لكل التطبيق (بدل القوائم المنسدلة الأصلية).
     - تفتح من مكانها: الشريحة الذهبية تجري حول الحقل ثم تتفتح الورقة بشرائح متتابعة
     - كل خيار يدخل بتأخير متدرج مع وميض ذهبي يجري على المختار
     - تنقلب تلقائياً للأعلى إن لم يوجد مكان أسفل الحقل
     - Flip: يقلب مجسم الحقل لثانية عند الاختيار
     الاستعمال:
       <Pick bind:value={x} options={['أ','ب']} placeholder="…" />
       <Pick bind:value={x} options={[{value:'1', label:'واحد', dot:'#f00'}]} disabled={false} />
       <Pick bind:value={x} options={o} labelOf={(o) => o.n} valueOf={(o) => o.id} size="sm" /> */
  import Icon from './Icon.svelte';
  import { buzz } from '../utils.js';
  import { tick } from 'svelte';

  let {
    value = $bindable(''),
    options = [],
    labelOf = (o) => (typeof o === 'object' ? o.label : o),
    valOf = (o) => (typeof o === 'object' ? o.value : o),
    dotOf = null,
    placeholder = 'اختاري…',
    disabled = false,
    size = 'md', /* md = حقول النماذج، sm = أسطر السلة */
    invalid = false,
    align = 'start', /* start | center */
    onchange = () => {} /* يُستدعى بعد كل اختيار — لمن يحتاج أثراً جانبياً */
  } = $props();

  let open = $state(false);
  let flip = $state(false);
  let host = $state(null);
  let pop = $state(null);
  let style = $state('');
  let above = $state(false);

  const selected = $derived(options.find((o) => valOf(o) === value) || null);
  const label = $derived(selected ? labelOf(selected) : '');

  function toggle() {
    if (disabled) return;
    if (open) { open = false; return; }
    buzz(6);
    const r = host.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    above = r.bottom + Math.min(options.length * 46 + 22, 264) > vh - 90 && r.top > 320;
    /* نُبقي الورقة داخل الشاشة: إن فاضت يميناً نُثبت حافتها اليمنى */
    const left = Math.max(10, Math.min(r.left, vw - Math.max(r.width, 190) - 10));
    style = `top:${r.bottom + 8}px; inset-inline-start:${left}px; width:${Math.max(r.width, 190)}px`;
    open = true;
    tick().then(() => pop?.querySelector('.pk-opt.on')?.scrollIntoView({ block: 'nearest' }));
  }

  function pick(o) {
    value = valOf(o);
    open = false;
    buzz([10, 40, 10]);
    flip = true;
    setTimeout(() => (flip = false), 700);
    onchange(value);
  }

  function onDocClick(e) {
    if (open && !host.contains(e.target) && !pop?.contains(e.target)) open = false;
  }
  $effect(() => {
    document.addEventListener('pointerdown', onDocClick, true);
    return () => document.removeEventListener('pointerdown', onDocClick, true);
  });
</script>

<button
  bind:this={host}
  type="button"
  class="pk pk-{size}"
  class:on={open}
  class:invalid
  class:flip
  class:empty={!label}
  {disabled}
  onclick={toggle}
>
  <span class="pk-face">
    {#if selected && dotOf?.(selected)}
      <span class="pk-dot" style="background:{dotOf(selected)}"></span>
    {/if}
    <span class="pk-label">{label || placeholder}</span>
  </span>
  <span class="pk-chev" class:up={open}><Icon name="back" size={14} /></span>
</button>

{#if open}
  <div class="pk-pop" bind:this={pop} style="{style}; --pk-above:{above ? 1 : 0}">
    <div class="pk-list" class:above>
      {#each options as o, i (valOf(o))}
        <button
          type="button"
          class="pk-opt"
          class:on={valOf(o) === value}
          style="animation-delay:{Math.min(i * 0.028, 0.28)}s"
          onclick={() => pick(o)}
        >
          {#if dotOf?.(o)}<span class="pk-dot" style="background:{dotOf(o)}"></span>{/if}
          <span class="pk-o">{labelOf(o)}</span>
          {#if valOf(o) === value}
            <span class="pk-check"><Icon name="check" size={15} /></span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  /* ---------- الحقل ---------- */
  .pk {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 50px;
    padding: 12px 16px;
    border-radius: var(--r-md);
    border: 1.5px solid var(--line-2);
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    cursor: pointer;
    text-align: right;
    position: relative;
    perspective: 600px;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .pk:active:not(:disabled) { transform: scale(0.985); }
  .pk:disabled { opacity: 0.5; cursor: not-allowed; }
  .pk.on { border-color: var(--burgundy); box-shadow: 0 0 0 4px rgba(181, 73, 91, 0.12); background: rgba(255, 255, 255, 0.75); }
  .pk.invalid { border-color: rgba(181, 73, 91, 0.55) !important; background: rgba(181, 73, 91, 0.05); }
  .pk.empty .pk-label { color: rgba(156, 123, 107, 0.6); font-weight: 500; }
  .pk-sm { min-height: 34px; padding: 6px 11px; border-radius: 10px; font-size: 12.5px; }
  .pk-face { display: inline-flex; align-items: center; gap: 8px; min-width: 0; transition: transform 0.6s cubic-bezier(0.34, 1.2, 0.44, 1); }
  .pk.flip .pk-face { animation: pk-flip 0.65s cubic-bezier(0.34, 1.2, 0.44, 1); }
  @keyframes pk-flip {
    0% { transform: rotateX(0); }
    45% { transform: rotateX(88deg) scale(0.96); }
    100% { transform: rotateX(0); }
  }
  .pk-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pk-dot { flex: none; width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12); }
  .pk-chev { flex: none; display: inline-flex; color: var(--taupe); transform: rotate(180deg); transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
  .pk-chev.up { transform: rotate(-90deg); }

  /* ---------- الورقة ---------- */
  .pk-pop { position: fixed; z-index: 70; }
  .pk-list {
    background: rgba(251, 243, 238, 0.94);
    backdrop-filter: blur(26px) saturate(1.5);
    -webkit-backdrop-filter: blur(26px) saturate(1.5);
    border: 1px solid var(--glass-border);
    border-radius: 18px;
    box-shadow: 0 18px 50px rgba(122, 46, 58, 0.24), 0 0 0 1px rgba(122, 46, 58, 0.05);
    padding: 7px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 264px;
    overflow-y: auto;
    scrollbar-width: none;
    position: relative;
    animation: pk-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    transform-origin: top;
  }
  .pk-list::-webkit-scrollbar { display: none; }
  .pk-list.above { transform-origin: bottom; }
  @keyframes pk-in {
    0% { opacity: 0; transform: translateY(-6px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .pk-opt {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 11px 12px;
    border: none;
    border-radius: 12px;
    background: transparent;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    cursor: pointer;
    text-align: right;
    position: relative;
    transition: background 0.15s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
    animation: pk-opt-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .pk-opt:active { transform: scale(0.97); background: var(--accent-soft); }
  @keyframes pk-opt-in {
    0% { opacity: 0; transform: translateX(10px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  /* الوميض الذهبي يجري عبر الخيار المختار */
  .pk-opt.on { background: var(--accent-soft); color: var(--burgundy-deep); }
  .pk-opt.on::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 12px;
    background: linear-gradient(100deg, transparent 20%, rgba(201, 161, 90, 0.22) 50%, transparent 80%);
    background-size: 250% 100%;
    animation: pk-shine 1.8s ease-in-out infinite;
    pointer-events: none;
  }
  @keyframes pk-shine {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .pk-check { margin-inline-start: auto; color: var(--burgundy); display: inline-flex; }
  .pk-o { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
