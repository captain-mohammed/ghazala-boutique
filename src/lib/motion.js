/* ============================================================
   Ghazala motion engine — position-aware, physics-flavored.
   Inspired by Magic UI / Aceternity / ReactBits techniques,
   rebuilt natively for Svelte 5 (no libraries, no AI slop).
   Everything respects prefers-reduced-motion.
   ============================================================ */

import { cubicOut, backOut } from 'svelte/easing';

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Click sparks (position-aware) ----------------
   A burst of brand-colored particles flies out from the exact
   pointer position, with a thin expanding ring. Global + delegated:
   every .btn, .chip, .key, .tab, .wa-chip gets it for free. */

const SPARK_COLORS = ['#B5495B', '#C9A15A', '#E8B4B8', '#D4B276', '#7A2E3A'];

export function spawnSparks(x, y, count = 8) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    const size = 3 + Math.random() * 4;
    const petal = i % 3 === 0; // every third particle is an elongated petal
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${petal ? size * 2.6 : size}px;height:${size}px;` +
      `border-radius:${petal ? '999px' : '50%'};background:${SPARK_COLORS[i % SPARK_COLORS.length]};` +
      `pointer-events:none;z-index:999;box-shadow:0 0 6px rgba(201,161,90,.4);`;
    document.body.appendChild(p);
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 22 + Math.random() * 30;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 8; // slight upward bias
    const anim = p.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx * 0.7}px,${dy * 0.7}px) rotate(${dx}deg) scale(0.9)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy + 10}px) rotate(${dx * 1.6}deg) scale(0.15)`, opacity: 0 }
      ],
      { duration: 480 + Math.random() * 180, easing: 'cubic-bezier(.2,.7,.3,1)' }
    );
    anim.onfinish = () => p.remove();
  }
  const ring = document.createElement('span');
  ring.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:10px;height:10px;border-radius:50%;` +
    `border:1.5px solid rgba(201,161,90,.55);pointer-events:none;z-index:999;transform:translate(-50%,-50%);`;
  document.body.appendChild(ring);
  const ra = ring.animate(
    [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.5 }, { transform: 'translate(-50%,-50%) scale(4.2)', opacity: 0 }],
    { duration: 420, easing: 'cubic-bezier(.2,.7,.3,1)' }
  );
  ra.onfinish = () => ring.remove();
}

/* Call once from main.js — every tap on an interactive element emits sparks */
export function initSparks() {
  if (typeof document === 'undefined') return;
  document.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target.closest?.('.btn, .chip, .key, .tab, .wa-chip, .iconbtn, [data-tab], .key-glass, .menu, .alert, .sale');
      if (!t) return;
      spawnSparks(e.clientX, e.clientY, 8);
    },
    { passive: true }
  );
}

/* Programmatic burst from a DOM element's center (or any coords) —
   used for sales/added celebrations so the burst starts at the button */
export function sparkFromRect(el, count = 14) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  spawnSparks(r.left + r.width / 2, r.top + r.height / 2, count);
}

/* ---------------- Magnetic pull ----------------
   Element leans toward the pointer while hovered — the closer,
   the stronger the pull; springs back on leave. */
export function magnet(node, opts = {}) {
  const strength = opts.strength ?? 0.3;
  const max = opts.max ?? 10;
  let raf = null;

  function move(e) {
    if (reducedMotion()) return;
    const r = node.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) * strength;
    let dy = (e.clientY - cy) * strength;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      node.style.transition = 'transform 0.12s ease-out';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    });
  }
  function leave() {
    cancelAnimationFrame(raf);
    node.style.transition = 'transform 0.45s cubic-bezier(.34,1.56,.64,1)';
    node.style.transform = 'translate(0,0)';
  }
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return {
    destroy() {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    }
  };
}

/* ---------------- Spotlight tracking ----------------
   Sets --mx/--my CSS vars so a radial highlight follows the
   pointer across the surface (pair with .spot in CSS). */
export function spotlight(node) {
  function move(e) {
    const r = node.getBoundingClientRect();
    node.style.setProperty('--mx', `${e.clientX - r.left}px`);
    node.style.setProperty('--my', `${e.clientY - r.top}px`);
  }
  function leave() {
    node.style.setProperty('--mx', '-300px');
    node.style.setProperty('--my', '-300px');
  }
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return {
    destroy() {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    }
  };
}

/* ---------------- 3D tilt ----------------
   Perspective tilt that follows the pointer, with a soft spring back. */
export function tilt(node, opts = {}) {
  const maxTilt = opts.max ?? 9;
  const scale = opts.scale ?? 1.02;
  function move(e) {
    if (reducedMotion()) return;
    const r = node.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    node.style.transition = 'transform 0.08s ease-out';
    node.style.transform = `perspective(600px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg) scale(${scale})`;
  }
  function leave() {
    node.style.transition = 'transform 0.6s cubic-bezier(.34,1.56,.64,1)';
    node.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)';
  }
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', leave);
  return {
    destroy() {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    }
  };
}

/* ---------------- Custom spring transitions ---------------- */

/* Screen change: content slides in FROM the tapped tab's direction,
   with a soft blur-clearing and scale settle. */
export function screenIn(node, { x = 0, y = 18, duration = 420, delay = 0 } = {}) {
  return {
    duration,
    delay,
    easing: cubicOut,
    css: (t, u) =>
      `opacity: ${t}; transform: translate(${u * x}px, ${u * y}px) scale(${0.975 + 0.025 * t}); filter: blur(${(u * 5).toFixed(1)}px);`
  };
}

/* Bottom sheet: slides up with a back-out overshoot settle (real spring feel) */
export function sheetSpring(node, { duration = 520 } = {}) {
  return {
    duration,
    easing: backOut,
    css: (t, u) => `transform: translateY(${(u * 100).toFixed(2)}%); opacity: ${Math.min(1, t * 2.4)};`
  };
}

/* Confirm card / small dialogs: scale + rise with overshoot */
export function springPop(node, { duration = 460 } = {}) {
  return {
    duration,
    easing: backOut,
    css: (t, u) => `transform: translateY(${(u * 44).toFixed(1)}px) scale(${(0.82 + 0.18 * t).toFixed(3)}); opacity: ${Math.min(1, t * 2.2)};`
  };
}

/* Toasts: bouncy drop-in from the top */
export function toastDrop(node, { duration = 460 } = {}) {
  return {
    duration,
    easing: backOut,
    css: (t, u) => `transform: translateY(${(-26 * u).toFixed(1)}px) scale(${(0.94 + 0.06 * t).toFixed(3)}); opacity: ${Math.min(1, t * 2.2)};`
  };
}
