import sharp from 'sharp';
import { mkdirSync, existsSync, copyFileSync } from 'fs';

mkdirSync('public/icons', { recursive: true });
mkdirSync('public/brand', { recursive: true });

const IVORY = { r: 0xFB, g: 0xF3, b: 0xEE, alpha: 1 };
const BURGUNDY = '#B5495B';
const DEEP = '#7A2E3A';

/* The real brand wordmark — the owner's chosen file. Transparent PNG whose
   burgundy ink (rgb(184,72,88)) matches the app's #B5495B almost exactly,
   so the mark melts cleanly into the ivory tiles. */
const SRC = 'D:/Hermes/Obsidian Vault/Ventures/Nabda Creative/Clients/Ghazala Boutique/Assets/Logo/Logo (Wordrmark).png';

const hasBrand = existsSync(SRC);
let trimmed = null;
if (hasBrand) {
  // Trim the transparent border so the ink fills the icon nicely
  trimmed = await sharp(SRC).trim().png().toBuffer();
  // Ship a copy as the default in-app logo (lock/dashboard/about)
  await sharp(trimmed).resize(256, 256, { fit: 'inside' }).png().toFile('public/brand/wordmark.png');
  console.log('✓ Brand wordmark → public/brand/wordmark.png');
}

/* Fallback (if the brand file is unavailable on this machine):
   rounded burgundy tile with the ghazal letter غ in ivory */
function fallbackSvg(size) {
  const r = Math.round(size * 0.146);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${BURGUNDY}"/><stop offset="1" stop-color="${DEEP}"/>
  </linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="central"
    font-family="Segoe UI, Tahoma, sans-serif" font-size="${size * 0.52}" font-weight="600"
    fill="#FBF3EE">غ</text>
</svg>`;
}

/* Build one icon: full-bleed ivory square (brand-safe for iOS/Android,
   no transparency) with the burgundy wordmark centered at markPct of the size */
async function buildIcon(size, markPct, out) {
  let base;
  if (hasBrand) {
    const markSize = Math.round(size * markPct);
    const mark = await sharp(trimmed).resize(markSize, markSize, { fit: 'inside' }).png().toBuffer();
    base = sharp({ create: { width: size, height: size, channels: 4, background: IVORY } })
      .composite([{ input: mark, left: Math.round((size - markSize) / 2), top: Math.round((size - markSize) / 2) }]);
  } else {
    base = sharp(Buffer.from(fallbackSvg(size)));
  }
  await base.png().toFile(out);
}

/* Regular icons: mark covers 78% for a bold home-screen presence */
await buildIcon(512, 0.78, 'public/icons/icon-512.png');
await buildIcon(192, 0.78, 'public/icons/icon-192.png');
await buildIcon(180, 0.78, 'public/icons/apple-touch-icon.png');
await buildIcon(32, 0.84, 'public/icons/favicon-32.png');

/* Maskable: content must survive any mask — mark at 62% keeps it inside
   the 80% safe circle, on a full-bleed ivory field */
await buildIcon(512, 0.62, 'public/icons/icon-maskable-512.png');

/* README header: real wordmark centered on ivory (fully inside the canvas) */
if (hasBrand) {
  const mark = await sharp(trimmed).resize(460, 460, { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: 1024, height: 512, channels: 4, background: IVORY } })
    .composite([{ input: mark, left: Math.round((1024 - 460) / 2), top: Math.round((512 - 460) / 2) }])
    .png().toFile('readme-header.png');
} else {
  copyFileSync('public/icons/icon-512.png', 'readme-header.png');
}

console.log('✓ Icons generated: 512, 192, 180, 32, maskable-512' + (hasBrand ? ' + readme-header (brand wordmark)' : ' (fallback غ tile)'));
