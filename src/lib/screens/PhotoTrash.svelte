<script>
  import Icon from '../components/Icon.svelte';
  import Glass from '../components/Glass.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { listPhotoTrash, restorePhotoTrash, purgePhotoTrash, purgeAllPhotoTrash, loadProducts, modelGroupKey, typeChain } from '../db.js';
  import { fmtNum, fmtDate, buzz } from '../utils.js';
  import { toastOk, toastErr, askConfirm } from '../store.js';

  let items = $state([]);
  let products = $state([]);
  let loading = $state(true);

  async function load() {
    const [t, p] = await Promise.all([listPhotoTrash(), loadProducts()]);
    items = t;
    products = p;
    loading = false;
  }
  load();

  const models = $derived.by(() => {
    const map = new Map();
    for (const p of products) {
      const mid = modelGroupKey(p);
      if (!map.has(mid)) map.set(mid, { modelId: mid, chain: typeChain(p) || p.name || mid });
      else if (!map.get(mid).chain) map.get(mid).chain = typeChain(p) || p.name || mid;
    }
    return [...map.values()].sort((a, b) => a.chain.localeCompare(b.chain, 'ar'));
  });

  async function assign(t, modelId) {
    if (!modelId) return;
    try {
      await restorePhotoTrash(t.id, modelId);
      toastOk('نُسبت الصورة للموديل');
      buzz(10);
      load();
    } catch { toastErr('تعذّر إسناد الصورة'); }
  }
  async function purge(t) {
    const ok = await askConfirm({ title: 'حذف الصورة نهائياً؟', body: 'لن يمكن استرجاعها بعد الآن.', okLabel: 'حذف نهائي', danger: true });
    if (!ok) return;
    await purgePhotoTrash(t.id);
    buzz(10);
    load();
  }
  async function emptyAll() {
    const ok = await askConfirm({ title: 'إفراغ سلة الصور؟', body: `سيُحذف ${fmtNum(items.length)} صورة نهائياً.`, okLabel: 'إفراغ', danger: true });
    if (!ok) return;
    await purgeAllPhotoTrash();
    toastOk('أُفرغت سلة الصور');
    load();
  }
</script>

<div class="stack" style="gap:12px">
  {#if !loading && items.length}
    <Glass style="padding:12px 14px; display:flex; align-items:center; gap:10px">
      <Icon name="image" size={18} color="var(--burgundy)" />
      <span class="small muted" style="flex:1">{fmtNum(items.length)} صورة محفوظة — من دمج أو حذف موديل</span>
      <button class="btn danger" style="min-height:38px" onclick={emptyAll}>إفراغ الكل</button>
    </Glass>
  {/if}

  {#if !loading && !items.length}
    <EmptyState
      title="سلة الصور فارغة"
      subtitle="صور الموديلات المدمجة أو المحذوفة تُحفظ هنا حتى تقرّري إعادة استخدامها أو حذفها"
      icon="image"
    />
  {:else}
    <div class="pthumbs">
      {#each items as t (t.id)}
        <Glass class="pt-card">
          <span class="pt-img"><img src={t.data} alt="" /></span>
          <span class="pt-meta">{t.modelId} · {fmtDate(t.deletedAt)}</span>
          <select class="input" onchange={(e) => assign(t, e.target.value)}>
            <option value="">استخدم لموديل…</option>
            {#each models as m (m.modelId)}
              <option value={m.modelId}>{m.chain}</option>
            {/each}
          </select>
          <button class="btn danger" onclick={() => purge(t)}>حذف</button>
        </Glass>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pthumbs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding-bottom: 80px; }
  :global(.pt-card) { padding: 10px; display: flex; flex-direction: column; gap: 8px; border-radius: var(--r-md); }
  .pt-img { aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--ivory); display: flex; align-items: center; justify-content: center; }
  .pt-img img { width: 100%; height: 100%; object-fit: cover; }
  .pt-meta { font-size: 11px; color: var(--taupe); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn { font-family: inherit; font-size: 12px; font-weight: 700; border-radius: var(--r-md); padding: 0 10px; cursor: pointer; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 38px; }
  .btn.danger { background: rgba(181,73,91,0.1); border-color: rgba(181,73,91,0.3); color: var(--burgundy); }
</style>
