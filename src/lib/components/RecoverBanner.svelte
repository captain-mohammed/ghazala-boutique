<script>
  import Glass from './Glass.svelte';
  import Icon from './Icon.svelte';
  let { title, body, onDiscard, onContinue } = $props();
</script>

<Glass class="recover" radius="var(--r-md)" style="padding:12px 14px; display:flex; align-items:center; gap:10px">
  <Icon name="alert" size={20} color="var(--warn)" />
  <div style="flex:1; min-width:0">
    <div class="bold small">{title}</div>
    <div class="muted small">{body}</div>
  </div>
  <button class="btn ghost" style="min-height:40px" onclick={onDiscard}>تجاهل</button>
  <button class="btn primary" style="min-height:40px" onclick={onContinue}>متابعة</button>
</Glass>

<style>
  :global(.recover) { border-color: rgba(201, 162, 75, 0.45); background: rgba(201, 162, 75, 0.08); }
  .btn { font-family: inherit; font-size: 13.5px; font-weight: 700; border-radius: var(--r-md); padding: 0 14px; cursor: pointer; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.6); color: var(--ink); }
  .btn.primary { background: var(--burgundy); border-color: var(--burgundy); color: #fff; }
  .btn.ghost { background: transparent; }
</style>
