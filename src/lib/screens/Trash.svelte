<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { listTrash, restoreTrash, purgeTrash, purgeAllTrash } from '../db.js';
  import { fmtIQD, fmtDate, fmtNum, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  let items = $state([]);
  let loading = $state(true);

  async function load() {
    items = await listTrash();
    loading = false;
  }
  load();

  function label(it) {
    if (it.kind === 'product') {
      const p = it.data?.product || {};
      const chain = [p.type, p.typeSub, p.typeSub2, p.typeSub3, p.color, p.size].filter(Boolean).join(' · ') || p.name || 'موديل';
      return chain + (p.price ? ` — ${fmtIQD(p.price)}` : '');
    }
    if (it.kind === 'expense') {
      const e = it.data?.expense || {};
      return `${e.category || 'مصروف'}${e.note ? ' — ' + e.note : ''} — ${fmtIQD(e.amount || 0)}`;
    }
    return 'عنصر';
  }
  const kindIcon = (it) => (it.kind === 'product' ? 'box' : 'wallet');
  const kindName = (it) => (it.kind === 'product' ? 'موديل' : 'مصروف');

  async function restore(it) {
    try {
      await restoreTrash(it.id);
      toastOk('تم الاسترجاع');
      buzz(10);
      load();
    } catch (e) {
      toastErr('تعذر الاسترجاع');
    }
  }
  async function purge(it) {
    const ok = await askConfirm({
      title: 'حذف نهائي؟',
      body: 'لن يمكن استرجاع هذا العنصر بعد الآن.',
      okLabel: 'حذف نهائي', danger: true
    });
    if (!ok) return;
    await purgeTrash(it.id);
    buzz(10);
    load();
  }
  async function emptyAll() {
    const ok = await askConfirm({
      title: 'إفراغ السلة؟',
      body: `سيُحذف ${fmtNum(items.length)} عنصر نهائياً ولا يمكن استرجاعها.`,
      okLabel: 'إفراغ السلة', danger: true
    });
    if (!ok) return;
    await purgeAllTrash();
    toastOk('أُفرغت السلة');
    load();
  }
</script>

<div class="stack" style="gap:12px">
  {#if !loading && items.length}
    <Glass style="padding:12px 14px; display:flex; align-items:center; gap:10px">
      <Icon name="trash" size={18} color="var(--burgundy)" />
      <span class="small muted" style="flex:1">{fmtNum(items.length)} عنصر محذوف — تُسترجع بضغطة</span>
      <button class="btn danger" style="min-height:38px" onclick={emptyAll}>إفراغ السلة</button>
    </Glass>
  {/if}

  {#if !loading && !items.length}
    <EmptyState
      title="السلة فارغة"
      subtitle="الموديلات والمصاريف المحذوفة تُحفظ هنا بدل أن تختفي — استرجعيها بضغطة"
      icon="trash"
    />
  {:else}
    <div class="stack" style="gap:8px; padding-bottom:80px">
      {#each items as it (it.id)}
        <Glass class="trow" style="padding:11px 13px; border-radius:var(--r-md)">
          <span class="t-ic"><Icon name={kindIcon(it)} size={17} color="var(--burgundy)" /></span>
          <div class="t-body">
            <div class="bold small">{label(it)}</div>
            <div class="muted tiny">{kindName(it)} · حُذف {fmtDate(it.deletedAt)}</div>
          </div>
          <button class="btn ghost" style="min-height:38px" onclick={() => restore(it)}>استرجاع</button>
          <button class="iconbtn" style="width:34px; height:34px; flex:none" aria-label="حذف نهائي" onclick={() => purge(it)}>
            <Icon name="x" size={13} />
          </button>
        </Glass>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(.trow) { display: flex; align-items: center; gap:10px; }
  .t-ic {
    flex: none; width:38px; height:38px; border-radius:11px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(181, 73, 91, 0.1); border: 1px solid rgba(181, 73, 91, 0.18);
  }
  .t-body { flex: 1; min-width: 0; }
  .t-body .bold { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .btn { font-family: inherit; font-size: 13px; font-weight: 700; border-radius: var(--r-md); padding: 0 12px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); }
  .btn.ghost { background: transparent; }
  .btn.danger { background: rgba(181,73,91,0.1); border-color: rgba(181,73,91,0.3); color: var(--burgundy); }
</style>
