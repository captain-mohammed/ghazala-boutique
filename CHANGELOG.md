# Changelog — بوتيك غزالة | Ghazala Boutique

All notable changes to the Ghazala Boutique inventory & sales app.

**Versioning scheme:** `MAJOR.MINOR.PATCH` — during active development the app moves through **0.1.0 → 0.1.9**, then rolls to **0.2.0**, then 0.2.1…0.2.9 → **0.3.0**, and so on. Bumping the minor digit (0.1→0.2) happens when a batch of new features is complete and stable; small improvements within a batch raise the patch digit. **1.0.0** is reserved for the first stable release used in the shop day-to-day.

Each version below lists **what was added and why it matters to the shop**.

---

## [0.2.0] — 2026-09-09

### Added
- **Deployed to GitHub Pages** — the app is now installable on the phone from a real HTTPS URL, and every future version ships automatically: pushing to `main` triggers a GitHub Actions workflow that builds and deploys within a minute.
  - *Benefit:* no cables, no APK, no store — the owner opens the link once on her Android, taps «إضافة إلى الشاشة الرئيسية», and the gazelle-marked app installs for daily shop use, fully offline afterwards.
  - CI uses `npm ci` for reproducible installs; the brand icons are committed so CI doesn't need the local logo source file.

---

## [0.1.9] — 2026-09-09

### Added
- **WhatsApp delivery message** (feature 2 from the roadmap) — every sale in سجل المبيعات now has a green «واتساب» chip, and the sale detail sheet has a full-width «نسخ رسالة الواتساب للزبون» button.
  - *What it copies:* a ready-to-send Arabic message with the customer's name, sale number, each item with quantity and price, subtotal, delivery fee, grand total, and the delivery tracking barcode — signed with the Ghazala name.
  - *Benefit:* the owner no longer types delivery details by hand for every shipment — one tap copies the full message, she pastes it into WhatsApp and sends. Works for any status (pending, delivered, returned), not just new sales.
  - Clipboard uses the modern async API with a hidden-textarea fallback for older WebViews; success/failure confirmed with a toast + haptic.

---

## [0.1.8] — 2026-09-09

### Changed
- **سجل المبيعات is now a dock tab** — the sales log joined the bottom navigation (6 tabs: الرئيسية، المخزون، بيع، تقارير، السجل، المزيد) with its own liquid bubble and the history icon. One tap from anywhere, no detour through المزيد.
  - *Benefit:* checking or updating a delivery's status happens many times a day — it now takes one tap.
- **«السجل الكامل» on the home screen now opens the sales log directly** (previously it went to المزيد).
- The sales log entry was removed from the المزيد menu (it moved to the dock).
- **Cleaner home header** — removed the «مباشر» badge and its pulsing dot, the slogan line and the thin gold line; the header is now just the logo + «بوتيك غزالة».

---

## [0.1.7] — 2026-09-09

### Changed
- **Real brand logo on the phone's home screen** — the packaged icons (app icon 512/192, Apple touch icon, favicon, maskable icon, README header) are now generated from the official Ghazala wordmark (`Logo (Wordmark)(BG).png`, chosen by the owner from the brand assets). The file is flattened on white, so the white is keyed out programmatically — the burgundy ink stays pixel-identical — and the mark is composited on full-bleed ivory tiles (78% for regular icons, 62% inside the maskable safe zone).
  - *Benefit:* when the app is installed, the icon on the Android home screen is the true Ghazala brand mark, not a placeholder.
- **Default in-app logo** (lock screen, dashboard header, More brand card, About) switched from the burgundy غ tile to the real wordmark (`public/brand/wordmark.png`, bundled + precached for offline). The غ tile remains as an automatic fallback if the image ever fails to load.
- Boot splash now shows the real wordmark while the app loads.
- The changeable custom logo feature (0.1.6) is unchanged and still overrides the default everywhere.

---

## [0.1.6] — 2026-09-09

### Added
- **Changeable app logo** (المزيد ← شعار التطبيق)
  - *Benefit:* the owner can put her own branding on the app without touching code. The logo changes live on the lock screen, dashboard, More tab and About screen; auto-downscaled and stored in the local database; included in backups; one-tap reset to the default burgundy غ tile.
- **Shared `Logo` component** used by every screen — one source of truth for branding.

### Technical
- Version now auto-syncs from `package.json` to the About screen at build time (`__APP_VERSION__`).
- New `fileToLogoDataUrl()` util (canvas downscale) and `logo` store.

---

## [0.1.5] — 2026-09-09

### Changed
- **Liquid glass dock navigation** (ILMAH-style) replaced the previous pill-indicator nav
  - *Benefit:* the app feels premium and alive — the active tab rises in a glass bubble that protrudes above the bar, with gooey melt cutouts around it (real CSS mask, so the aurora background shows through), spring-eased sliding, and the icon↔label swap animation.

### Fixed
- **Lock-screen keypad dead keys** (3, 5, 7…) — decorative gradient layers were invisibly swallowing taps on part of the keypad; they are now `pointer-events: none` and the keypad sits on its own layer. All 11 keys hit-tested programmatically.
- Keypad now reads **1-2-3 / 4-5-6 / 7-8-9 / 0-⌫ left-to-right** like a phone dialer (digits are English/1234), delete arrow flipped to match.

---

## [0.1.4] — 2026-09-08

### Added
- **Welcome toast after every successful login** («مرحباً بعودتك 👋») — same success style as the first-time PIN setup toast.
  - *Benefit:* small human touch; confirms the unlock registered even before the dashboard paints.

---

## [0.1.3] — 2026-09-08

### Fixed
- **Sale could not complete** — a stray `transition:none` attribute compiled as JavaScript and crashed the sheet close animation; removed.

---

## [0.1.2] — 2026-09-08

### Fixed
- **Boot splash stayed on top of the app** after mount — removed from the DOM once Svelte mounts.

---

## [0.1.1] — 2026-09-08

### Fixed
- Component imports (Svelte 5 default exports), Celebrate parser error, icon generation switched to direct SVG→PNG rendering, Noto Sans Arabic font subsets bundled locally (Arabic + Latin/digits) so the app is 100% offline.

---

## [0.1.0] — 2026-09-08

### The complete first build 🎉

- **PIN lock** — set on first launch, SHA-256 hashed, never stored in plain text; 4-digit glass keypad with haptics; changeable in settings.
  - *Benefit:* sales and stock data stay private if the phone is handed to someone else.
- **Dashboard (الرئيسية)** — animated count-up tickers for today's sales, profit, stock value and units; greeting by time of day; low-stock and dead-stock alerts; latest transactions; empty-state guide.
  - *Benefit:* the state of the boutique in one glance the moment you open the app.
- **Inventory (المخزون)** — fast add-item flow (category chips, women's type chips بوت/سلامبر/موال/كعب عالي, color, size, cost/price with **live profit preview**, quantity stepper); auto SKU **GHZ-0001**; search across name/color/size/code; category filters; sort; quantity badge colors (green/low/red-zero); detail sheet with quick +/− stock moves and a full **movement history**.
  - *Benefit:* a new shoe is entered in under 20 seconds — designed for starting the whole boutique stock from the app itself, no Excel import needed.
- **Selling (بيع)** — search or barcode-scan items into a cart, floating cart bar, checkout with customer name/phone, delivery fee auto-filled (5,000 د.ع default), **delivery company barcode scan**, totals sheet, success celebration.
  - *Benefit:* the whole sell flow in under 10 seconds one-handed; stock decrements automatically and every movement is logged.
- **Reports (تقارير)** — period chips (today/7/30/all), revenue/profit/count/stock-value cards, animated 14-day bar chart, best sellers, low-stock list, dead-stock list.
  - *Benefit:* know what sells and what's stuck, without spreadsheets.
- **Sales log (سجل المبيعات)** — filter by status (قيد التوصيل / تم التسليم / مرتجع), full detail sheet with per-item breakdown, totals and profit, one-tap status updates, returns that **re-stock the items automatically**.
- **Stocktake (الجرد)** — scan or search items, enter counted quantities, live diff vs expected, apply all corrections with logged movements.
  - *Benefit:* shelf-counting without paper; discrepancies are recorded, not guessed.
- **Backup & Excel (النسخ الاحتياطي)** — one-tap full JSON backup to Downloads, weekly reminder banner, restore with merge-or-replace choice, **Excel export** (المخزون + المبيعات sheets) via SheetJS.
  - *Benefit:* the only real protection against browser-data wipes — data lives 100% on the phone by design.
- **Settings (الإعدادات)** — delivery fee, low-stock threshold, dead-stock days, category manager (add/remove), PIN change/remove, demo data, wipe-all.
- **Brand & design system** — Ghazala identity (burgundy `#B5495B`, deep `#7A2E3A`, gold `#C9A15A`, ivory `#FBF3EE`, taupe `#9C7B6B`), glassmorphism with drifting aurora background, Noto Sans Arabic bundled locally, RTL-first, digits always 1234 format, currency always **د.ع**, celebration bursts, ripples, haptics, count-up tickers — respecting `prefers-reduced-motion`.
- **PWA** — installable on Android (Add to Home Screen), service worker precaching all assets, works fully offline; manifest in Arabic/RTL.

---

## Roadmap (proposed, awaiting approval)

- **0.2.0 batch (candidates):**
  - Multi-size quick entry — add one model across sizes 36–41 in a single save
  - WhatsApp delivery message — one tap copies a formatted customer message per sale
  - Expenses tracker — rent/transport netted against profit in dashboard & reports
- Later batches: dark theme, product photos per item, more report charts, second-device sync.

---

*[format: keep newest version at the top; add entries while developing, one version bump per meaningful change]*
