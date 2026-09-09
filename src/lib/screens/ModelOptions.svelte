<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { setSetting, modelOptions } from '../db.js';
  import { buzz } from '../utils.js';
  import { toastOk } from '../store.js';

  let opts = $state(null);
  let newCat = $state('');
  let newType = $state('');
  let newSeason = $state('');
  let newMaterial = $state('');
  let newColorName = $state('');
  let newColorHex = $state('#b5495b');

  (async () => { opts = await modelOptions(); })();

  async function save(key, value, msg = 'تم الحفظ') {
    await setSetting(key, value);
    toastOk(msg);
    buzz(10);
  }
  async function add(listKey, inputSetter, raw) {
    const name = String(raw || '').trim();
    if (!name) return;
    const cur = opts[listKey];
    if (cur.includes(name)) { inputSetter(''); return; }
    opts = { ...opts, [listKey]: [...cur, name] };
    inputSetter('');
    await save(listKey, opts[listKey], 'أُضيف إلى القائمة');
  }
  async function rm(listKey, name) {
    opts = { ...opts, [listKey]: opts[listKey].filter((x) => x !== name) };
    await save(listKey, opts[listKey], 'حُذف');
  }
  async function addColor() {
    const name = newColorName.trim();
    if (!name) return;
    if (opts.colors.some((c) => c.label === name)) { toastOk('هذا اللون موجود'); return; }
    opts = { ...opts, colors: [...opts.colors, { label: name, hex: newColorHex }] };
    newColorName = '';
    await save('modelColors', opts.colors, 'أُضيف اللون بدائرته');
  }
  async function rmColor(label) {
    opts = { ...opts, colors: opts.colors.filter((c) => c.label !== label) };
    await save('modelColors', opts.colors, 'حُذف اللون');
  }
  async function recolor(label, hex) {
    opts = { ...opts, colors: opts.colors.map((c) => (c.label === label ? { ...c, hex } : c)) };
    await save('modelColors', opts.colors, 'دُبطت درجة اللون');
  }
</script>

{#if opts}
  <div class="stack" style="gap:12px">
    <Glass class="rise" style="padding:16px">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="box" size={17} color="var(--burgundy)" /> التصنيفات</h2>
      <p class="muted small" style="margin:0 0 10px">نسائية، رجالية، أطفال — وأيّ تقسيم تحبينه.</p>
      <div class="row wrap" style="gap:8px; margin-bottom:10px">
        {#each opts.categories as c (c)}
          <span class="chip on">
            {c}
            <button class="opt-x" onclick={() => rm('categories', c)} aria-label="حذف {c}"><Icon name="x" size={12} color="#fff" /></button>
          </span>
        {/each}
      </div>
      <div class="row" style="gap:8px">
        <input class="input" style="flex:1" bind:value={newCat} placeholder="تصنيف جديد…" onkeydown={(e) => e.key === 'Enter' && add('categories', (v) => (newCat = v), newCat)} />
        <button class="btn" onclick={() => add('categories', (v) => (newCat = v), newCat)}><Icon name="plus" size={16} /> إضافة</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.05s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="list" size={17} color="var(--burgundy)" /> الأنواع</h2>
      <p class="muted small" style="margin:0 0 10px">بوت، سلامبر، موال… — النوع اللي يوصف مخزونك، ويعود يطلع بالتقريرات والفلاتر.</p>
      <div class="row wrap" style="gap:8px; margin-bottom:10px">
        {#each opts.types as t (t)}
          <span class="chip">
            {t}
            <button class="opt-x dark" onclick={() => rm('types', t)} aria-label="حذف {t}"><Icon name="x" size={12} /></button>
          </span>
        {/each}
      </div>
      <div class="row" style="gap:8px">
        <input class="input" style="flex:1" bind:value={newType} placeholder="نوع جديد…" onkeydown={(e) => e.key === 'Enter' && add('types', (v) => (newType = v), newType)} />
        <button class="btn" onclick={() => add('types', (v) => (newType = v), newType)}><Icon name="plus" size={16} /> إضافة</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.1s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="calendar" size={17} color="var(--gold)" /> تصنيف الموسم</h2>
      <p class="muted small" style="margin:0 0 10px">شتائي / صيفي — من يعرف موسم الحذاء يعرف وقت عرضه.</p>
      <div class="row wrap" style="gap:8px; margin-bottom:10px">
        {#each opts.seasons as s (s)}
          <span class="chip">
            {s}
            <button class="opt-x dark" onclick={() => rm('seasons', s)} aria-label="حذف {s}"><Icon name="x" size={12} /></button>
          </span>
        {/each}
      </div>
      <div class="row" style="gap:8px">
        <input class="input" style="flex:1" bind:value={newSeason} placeholder="موسم جديد…" onkeydown={(e) => e.key === 'Enter' && add('seasons', (v) => (newSeason = v), newSeason)} />
        <button class="btn" onclick={() => add('seasons', (v) => (newSeason = v), newSeason)}><Icon name="plus" size={16} /> إضافة</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.15s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="tag" size={17} color="var(--burgundy)" /> المادة المصنوع منها</h2>
      <p class="muted small" style="margin:0 0 10px">جلد طبيعي، جلد صناعي، قماش… — تذكرة سريعة وقت السؤال والبيع.</p>
      <div class="row wrap" style="gap:8px; margin-bottom:10px">
        {#each opts.materials as m (m)}
          <span class="chip">
            {m}
            <button class="opt-x dark" onclick={() => rm('materials', m)} aria-label="حذف {m}"><Icon name="x" size={12} /></button>
          </span>
        {/each}
      </div>
      <div class="row" style="gap:8px">
        <input class="input" style="flex:1" bind:value={newMaterial} placeholder="مادة جديدة…" onkeydown={(e) => e.key === 'Enter' && add('materials', (v) => (newMaterial = v), newMaterial)} />
        <button class="btn" onclick={() => add('materials', (v) => (newMaterial = v), newMaterial)}><Icon name="plus" size={16} /> إضافة</button>
      </div>
    </Glass>

    <Glass class="rise" style="padding:16px; animation-delay:0.2s">
      <h2 class="h2" style="margin-bottom:4px"><Icon name="sparkle" size={17} color="var(--gold)" /> الألوان ودوائرها</h2>
      <p class="muted small" style="margin:0 0 10px">اختاري درجة الدائرة بالضبط من علبة الألوان قبل الإضافة — وبالنموذج التصوير يصير نفس اللون.</p>
      <div class="row" style="gap:8px; margin-bottom:12px">
        <input class="color-box" type="color" bind:value={newColorHex} aria-label="درجة اللون" />
        <input class="input" style="flex:1" bind:value={newColorName} placeholder="اسم اللون…" onkeydown={(e) => e.key === 'Enter' && addColor()} />
        <button class="btn" onclick={addColor}><Icon name="plus" size={16} /> لون</button>
      </div>
      <div class="color-list">
        {#each opts.colors as c (c.label)}
          <div class="color-row">
            <label class="dot-wrap" title="اضبطي الدرجة بدقة">
              <span class="dot" style="background:{c.hex}"></span>
              <input type="color" value={c.hex} onchange={(e) => recolor(c.label, e.target.value)} aria-label="درجة {c.label}" />
            </label>
            <span class="bold small" style="flex:1">{c.label}</span>
            <span class="muted tiny">{c.hex}</span>
            <button class="opt-x dark" onclick={() => rmColor(c.label)} aria-label="حذف {c.label}"><Icon name="x" size={13} /></button>
          </div>
        {/each}
      </div>
    </Glass>
  </div>
{:else}
  <div class="muted small" style="padding:20px; text-align:center">تحميل…</div>
{/if}

<style>
  .opt-x {
    background: rgba(0, 0, 0, 0.18);
    border: none;
    border-radius: 50%;
    width: 17px; height: 17px;
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0;
  }
  .opt-x.dark { background: rgba(122, 46, 58, 0.1); color: var(--burgundy); }
  .color-list { display: flex; flex-direction: column; gap: 6px; }
  .color-row {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 10px;
    border-radius: var(--r-sm);
    background: rgba(255, 255, 255, 0.35);
    border: 1px solid var(--line);
  }
  .dot-wrap { position: relative; display: inline-flex; cursor: pointer; }
  .dot {
    width: 30px; height: 30px; border-radius: 50%;
    border: 1.5px solid var(--line-2);
    box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.3), inset 0 -3px 6px rgba(0, 0, 0, 0.16);
  }
  .dot-wrap input[type="color"] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
  .color-box {
    width: 50px; height: 50px; flex: none;
    border-radius: 14px;
    border: 1.5px solid var(--line-2);
    background: none;
    padding: 4px;
    cursor: pointer;
  }
</style>
