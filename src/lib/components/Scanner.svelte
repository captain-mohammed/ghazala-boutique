<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import { toast, toastErr } from '../store.js';
  import { buzz } from '../utils.js';

  let { open = false, onclose = () => {}, onscan = () => {}, title = 'مسح الباركود' } = $props();

  let videoEl = $state(null);
  let scanning = $state(false);
  let torchOn = $state(false);
  let torchSupported = $state(false);
  let stream = null;
  let detector = null;
  let zxingReader = null;
  let raf = null;
  let lastCode = '';
  let lastAt = 0;

  onMount(() => { if (open) start(); });
  $effect(() => { if (open) start(); else stop(); });

  async function start() {
    if (scanning) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoEl) {
        videoEl.srcObject = stream;
        await videoEl.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.();
      torchSupported = !!caps?.torch;

      if ('BarcodeDetector' in window) {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        detector = new window.BarcodeDetector({ formats: formats.length ? formats : ['ean_13', 'code_128', 'code_39', 'qr_code'] });
        loopNative();
      } else {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        zxingReader = new BrowserMultiFormatReader();
        zxingReader.decodeFromVideoElement(videoEl, (result) => {
          if (result) hit(result.getText());
        });
      }
      scanning = true;
    } catch (e) {
      toastErr('تعذر فتح الكاميرا — تأكد من الإذن');
      onclose();
    }
  }

  async function loopNative() {
    const tick = async () => {
      if (!detector || !videoEl || !open) return;
      try {
        const codes = await detector.detect(videoEl);
        if (codes?.length) hit(codes[0].rawValue);
      } catch { /* transient decode errors are fine */ }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function hit(code) {
    const now = Date.now();
    if (code === lastCode && now - lastAt < 2500) return;
    lastCode = code;
    lastAt = now;
    buzz(30);
    toast(`تم المسح: ${code}`);
    onscan(code);
    stop();
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    try { zxingReader?.reset?.(); } catch {}
    zxingReader = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    detector = null;
    scanning = false;
    torchOn = false;
  }
  onDestroy(stop);

  function manualSubmit(e) {
    e.preventDefault();
    const v = new FormData(e.currentTarget).get('code')?.trim();
    if (v) { onscan(v); stop(); }
  }
</script>

{#if open}
  <div class="scan-backdrop" transition:fade={{ duration: 160 }}>
    <div class="scan-card glass-strong">
      <div class="scan-head">
        <h2 class="h2">{title}</h2>
        <button class="iconbtn" onclick={() => { stop(); onclose(); }} aria-label="إغلاق">
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="viewport">
        <video bind:this={videoEl} playsinline muted autoplay></video>
        {#if scanning}
          <div class="frame"><span></span><span></span><span></span><span></span></div>
          <div class="laser"></div>
        {:else}
          <div class="starting muted small">جارٍ تشغيل الكاميرا…</div>
        {/if}
      </div>

      <div class="row" style="justify-content:center; gap:10px">
        {#if torchSupported}
          <button class="btn {torchOn ? 'gold' : ''}" onclick={toggleTorch}>
            <Icon name="flame" size={18} /> {torchOn ? 'إطفاء الضوء' : 'إضاءة'}
          </button>
        {/if}
        <button class="btn ghost" onclick={() => { stop(); onclose(); }}>إلغاء</button>
      </div>

      <form class="row manual" onsubmit={manualSubmit}>
        <input class="input" name="code" placeholder="أو أدخلي الرقم يدوياً…" autocomplete="off" />
        <button class="btn primary" type="submit">حفظ</button>
      </form>
    </div>
  </div>
{/if}

<style>
  .scan-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(30, 12, 15, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .scan-card { width: 100%; max-width: 420px; padding: 16px; }
  .scan-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .viewport {
    position: relative;
    border-radius: var(--r-md);
    overflow: hidden;
    background: #1e0c0f;
    aspect-ratio: 4 / 3;
    margin-bottom: 12px;
  }
  video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .starting { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #FBF3EE; }
  .frame span { position: absolute; width: 30px; height: 30px; border: 3px solid #C9A15A; }
  .frame span:nth-child(1) { top: 12%; right: 10%; border-left: none; border-bottom: none; border-radius: 0 10px 0 0; }
  .frame span:nth-child(2) { top: 12%; left: 10%; border-right: none; border-bottom: none; border-radius: 10px 0 0 0; }
  .frame span:nth-child(3) { bottom: 12%; right: 10%; border-left: none; border-top: none; border-radius: 0 0 10px 0; }
  .frame span:nth-child(4) { bottom: 12%; left: 10%; border-right: none; border-top: none; border-radius: 0 0 0 10px; }
  .laser {
    position: absolute;
    left: 8%;
    right: 8%;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #E8B4B8, #C9A15A, #E8B4B8, transparent);
    animation: laser 1.6s ease-in-out infinite;
  }
  @keyframes laser { 0%, 100% { top: 22%; } 50% { top: 78%; } }
  .manual { margin-top: 10px; }
</style>
