<script>
  /* «رجوع» — the sub-pages' way home. The arrow is bespoke: a chevron that
     dissolves into a drawn tail curling down (a hand-inked return-stroke, not
     a stock icon-library glyph). RTL: back points right, toward the reader. */
  import { buzz } from '../utils.js';

  let { label = 'رجوع', onback = () => {} } = $props();

  function back() {
    buzz(6);
    onback();
  }
</script>

<button class="bb" onclick={back} aria-label={label}>
  <span class="bb-ring">
    <svg class="bb-arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <!-- chevron head: rounded joins, slightly asymmetric for a calligraphic lean -->
      <path d="M10.6 4.7 17.3 11.1" />
      <path d="M17.3 12.9 10.6 19.3" />
      <!-- ink tail: leaves the head, runs left, then a soft elbow turning down -->
      <path d="M16.9 12h-7.1a5 5 0 0 0-5 5v1.6" />
      <!-- a period at the tail's end — like a full stop after the word -->
      <circle cx="4.8" cy="21.2" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  </span>
  <span class="bb-txt">{label}</span>
</button>

<style>
  .bb {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--glass-border);
    background: var(--glass);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-radius: 999px;
    padding: 5px 14px 5px 16px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 800;
    color: var(--ink);
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(58, 26, 32, 0.08);
    transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s;
  }
  .bb:active { transform: scale(0.93); background: var(--accent-soft); }
  .bb-ring {
    flex: none;
    width: 30px; height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(150deg, var(--burgundy), var(--burgundy-deep));
    box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.28), 0 3px 9px rgba(122, 46, 58, 0.28);
  }
  .bb-arrow {
    width: 17px; height: 17px;
    stroke: #fff;
    stroke-width: 1.9;
    stroke-linecap: round;
    transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  /* the stroke leans back (rightward) on press — like it's taking the step */
  .bb:active .bb-arrow { transform: translateX(2.5px); }
</style>
