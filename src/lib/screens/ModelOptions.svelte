<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import { setSetting, modelOptions, subsOfType, subsOfType2, subsOfType3 } from '../db.js';
  import { buzz } from '../utils.js';
  import { toastOk } from '../store.js';

  let opts = $state(null);
  let newCat = $state('');
  let newType = $state('');
  let newSeason = $state('');
  let newMaterial = $state('');
  let newColorName = $state('');
  let newColorHex = $state('#b5495b');
  let subFor = $state('');    // النوع المفتوح لتحرير قائمته الفرعية
  let newSub = $state('');
  let sub2For = $state('');   // التفصيل المفتوح لتحرير قائمته الثالثة
  let newSub2 = $state('');
  let sub3For = $state('');   // تفصيل أدق المفتوح لتحرير قائمته الرابعة
  let newSub3 = $state('');

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
    if (listKey === 'types') {
      /* حذف النوع يمحو شجرته كاملة — الأبناء يتبعون الأب */
      const t1 = { ...(opts.typeSubs || {}) }; delete t1[name];
      const t2 = { ...(opts.typeSubs2 || {}) }; delete t2[name];
      const t3 = { ...(opts.typeSubs3 || {}) }; delete t3[name];
      opts = { ...opts, typeSubs: t1, typeSubs2: t2, typeSubs3: t3 };
      await setSetting('typeSubs', t1); await setSetting('typeSubs2', t2); await setSetting('typeSubs3', t3);
    }
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

  /* ---- القوائم الفرعية تحت النوع (بوت ← كعب عالي…) — عدديها كما تحبين ---- */
  async function addSub(type, name) {
    const n = String(name || '').trim();
    if (!n || !type) return;
    const subs = opts.typeSubs?.[type] || [];
    if (subs.includes(n)) { newSub = ''; return; }
    const next = { ...opts.typeSubs, [type]: [...subs, n] };
    opts = { ...opts, typeSubs: next };
    newSub = '';
    await save('typeSubs', next, 'أُضيفت للقائمة الفرعية');
  }
  async function rmSub(type, name) {
    const subs = (opts.typeSubs?.[type] || []).filter((x) => x !== name);
    const next = { ...opts.typeSubs, [type]: subs };
    const next2 = { ...opts.typeSubs2 };
    if (next2[type]) { delete next2[type][name]; /* الأبناء يتبعون الأب */ }
    const next3 = { ...(opts.typeSubs3 || {}) };
    if (next3[type]) { delete next3[type][name]; }
    opts = { ...opts, typeSubs: next, typeSubs2: next2, typeSubs3: next3 };
    if (sub2For === name) sub2For = '';
    await save('typeSubs', next, 'حُذفت من القائمة الفرعية');
    await setSetting('typeSubs2', next2);
    await setSetting('typeSubs3', next3);
  }

  /* ---- القوائم الثالثة تحت التفصيل (بوت ← كعب عالي ← جيب جانبي…) ---- */
  async function addSub2(type, sub, name) {
    const n = String(name || '').trim();
    if (!n || !type || !sub) return;
    const tree = { ...(opts.typeSubs2 || {}) };
    const leaf = { ...(tree[type] || {}) };
    const list = leaf[sub] || [];
    if (list.includes(n)) { newSub2 = ''; return; }
    leaf[sub] = [...list, n];
    tree[type] = leaf;
    opts = { ...opts, typeSubs2: tree };
    newSub2 = '';
    await save('typeSubs2', tree, 'أُضيفت للقائمة الثالثة');
  }
  async function rmSub2(type, sub, name) {
    const tree = { ...(opts.typeSubs2 || {}) };
    const leaf = { ...(tree[type] || {}) };
    leaf[sub] = (leaf[sub] || []).filter((x) => x !== name);
    tree[type] = leaf;
    const tree3 = { ...(opts.typeSubs3 || {}) };
    if (tree3[type]?.[sub]) {
      const leaf3 = { ...tree3[type][sub] };
      delete leaf3[name];
      tree3[type] = { ...tree3[type], [sub]: leaf3 };
    }
    opts = { ...opts, typeSubs2: tree, typeSubs3: tree3 };
    if (sub3For === name) sub3For = '';
    await save('typeSubs2', tree, 'حُذفت من القائمة الثالثة');
    await setSetting('typeSubs3', tree3);
  }

  /* ---- القوائم الرابعة تحت تفصيل أدق ---- */
  async function addSub3(type, sub, sub2, name) {
    const n = String(name || '').trim();
    if (!n || !type || !sub || !sub2) return;
    const tree = { ...(opts.typeSubs3 || {}) };
    const branch = { ...(tree[type] || {}) };
    const leaf = { ...(branch[sub] || {}) };
    const list = leaf[sub2] || [];
    if (list.includes(n)) { newSub3 = ''; return; }
    leaf[sub2] = [...list, n];
    branch[sub] = leaf;
    tree[type] = branch;
    opts = { ...opts, typeSubs3: tree };
    newSub3 = '';
    await save('typeSubs3', tree, 'أُضيفت للقائمة الرابعة');
  }
  async function rmSub3(type, sub, sub2, name) {
    const tree = { ...(opts.typeSubs3 || {}) };
    const branch = { ...(tree[type] || {}) };
    const leaf = { ...(branch[sub] || {}) };
    leaf[sub2] = (leaf[sub2] || []).filter((x) => x !== name);
    branch[sub] = leaf;
    tree[type] = branch;
    opts = { ...opts, typeSubs3: tree };
    await save('typeSubs3', tree, 'حُذفت من القائمة الرابعة');
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

      <!-- القوائم الفرعية: بعد النوع تظهر قائمة ثانية (بوت ← كعب عالي…) -->
      <div class="stack" style="gap:8px; margin-top:14px; padding-top:12px; border-top:1px dashed var(--line)">
        <div class="muted tiny bold">القوائم الفرعية — أربعة مستويات: نوع ← تفصيل ← تفصيل أدق ← تفصيل أخير (تُعرف في الفلاتر والفورم والبطاقات)</div>
        {#each opts.types as t (t)}
          {@const subs = opts.typeSubs?.[t] || []}
          <div class="sub-block">
            <button type="button" class="sub-toggle" onclick={() => { subFor = subFor === t ? '' : t; newSub = ''; }}>
              <Icon name={subFor === t ? 'x' : 'list'} size={13} color="var(--burgundy)" />
              <b>{t}</b>
              <span class="muted tiny">{subs.length ? `${subs.length} فرعي` : 'بلا قائمة فرعية'}</span>
              <i class="sub-chev" class:open={subFor === t}></i>
            </button>
            {#if subFor === t}
              {#if subs.length}
                <div class="row wrap" style="gap:6px; margin-top:7px">
                  {#each subs as st (st)}
                    <span class="chip on">
                      {st}
                      <button class="opt-x" onclick={() => rmSub(t, st)} aria-label="حذف {st}"><Icon name="x" size={12} color="#fff" /></button>
                    </span>
                  {/each}
                </div>
              {/if}
              <div class="row" style="gap:8px; margin-top:7px">
                <input class="input" style="flex:1" bind:value={newSub} placeholder={`فرعي جديد تحت «${t}»…`} onkeydown={(e) => e.key === 'Enter' && addSub(t, newSub)} />
                <button class="btn" onclick={() => addSub(t, newSub)}><Icon name="plus" size={15} /> إضافة</button>
              </div>

              <!-- القائمة الثالثة: تحت كل تفصيل قائمة خاصة به -->
              {#each subs as st (st)}
                {@const subs2 = subsOfType2(opts.typeSubs2, t, st)}
                <div class="sub-block" style="margin-top:7px; padding-inline-start:14px">
                  <button type="button" class="sub-toggle" onclick={() => { sub2For = sub2For === st ? '' : st; newSub2 = ''; }}>
                    <Icon name={sub2For === st ? 'x' : 'list'} size={12} color="var(--gold)" />
                    <b>{st}</b>
                    <span class="muted tiny">{subs2.length ? `${subs2.length} ثالث` : 'بلا قائمة ثالثة'}</span>
                    <i class="sub-chev" class:open={sub2For === st}></i>
                  </button>
                  {#if sub2For === st}
                    {#if subs2.length}
                      <div class="row wrap" style="gap:6px; margin-top:6px">
                        {#each subs2 as st2 (st2)}
                          <span class="chip on">
                            {st2}
                            <button class="opt-x" onclick={() => rmSub2(t, st, st2)} aria-label="حذف {st2}"><Icon name="x" size={12} color="#fff" /></button>
                          </span>
                        {/each}
                      </div>
                    {/if}
                    <div class="row" style="gap:8px; margin-top:6px">
                      <input class="input" style="flex:1" bind:value={newSub2} placeholder={`ثالث جديد تحت «${st}»…`} onkeydown={(e) => e.key === 'Enter' && addSub2(t, st, newSub2)} />
                      <button class="btn" onclick={() => addSub2(t, st, newSub2)}><Icon name="plus" size={14} /> إضافة</button>
                    </div>

                    <!-- القائمة الرابعة: تحت كل تفصيل أدق قائمتها الخاصة -->
                    {#each subs2 as st2 (st2)}
                      {@const subs3 = subsOfType3(opts.typeSubs3, t, st, st2)}
                      <div class="sub-block" style="margin-top:6px; padding-inline-start:14px">
                        <button type="button" class="sub-toggle" onclick={() => { sub3For = sub3For === st2 ? '' : st2; newSub3 = ''; }}>
                          <Icon name={sub3For === st2 ? 'x' : 'list'} size={11} color="var(--gold)" />
                          <b>{st2}</b>
                          <span class="muted tiny">{subs3.length ? `${subs3.length} رابع` : 'بلا قائمة رابعة'}</span>
                          <i class="sub-chev" class:open={sub3For === st2}></i>
                        </button>
                        {#if sub3For === st2}
                          {#if subs3.length}
                            <div class="row wrap" style="gap:6px; margin-top:6px">
                              {#each subs3 as st3 (st3)}
                                <span class="chip on">
                                  {st3}
                                  <button class="opt-x" onclick={() => rmSub3(t, st, st2, st3)} aria-label="حذف {st3}"><Icon name="x" size={12} color="#fff" /></button>
                                </span>
                              {/each}
                            </div>
                          {/if}
                          <div class="row" style="gap:8px; margin-top:6px">
                            <input class="input" style="flex:1" bind:value={newSub3} placeholder={`رابع جديد تحت «${st2}»…`} onkeydown={(e) => e.key === 'Enter' && addSub3(t, st, st2, newSub3)} />
                            <button class="btn" onclick={() => addSub3(t, st, st2, newSub3)}><Icon name="plus" size={14} /> إضافة</button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  {/if}
                </div>
              {/each}
            {/if}
          </div>
        {/each}
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

  .sub-block { display: flex; flex-direction: column; }
  .sub-toggle {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 9px 12px;
    font-family: inherit; font-size: 13px; color: var(--ink);
    cursor: pointer;
  }
  .sub-toggle b { flex: none; }
  .sub-toggle span { flex: 1; text-align: right; }
  .sub-chev {
    width: 8px; height: 8px;
    border-inline-end: 2px solid var(--taupe); border-bottom: 2px solid var(--taupe);
    transform: rotate(-45deg); transition: transform 0.2s ease;
  }
  .sub-chev.open { transform: rotate(45deg); }
</style>
