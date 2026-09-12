# AGENTS.md — بوتيك غزالة (Ghazala Boutique)

Offline-first Arabic RTL PWA for a shoe boutique in Iraq: inventory, COD sales via delivery companies, WhatsApp messaging. 100% local data (IndexedDB), no backend. Push to `main` auto-deploys to GitHub Pages.

## Stack & commands

- Svelte 5 (runes: `$state/$derived/$effect/$props`), Vite 7, plain JS — **no TypeScript**, no router library.
- `npm run dev` (port 5173, `--host`) · `npm run build` · `npm run preview` · `npm run icons` (sharp).
- Windows gotcha: killing the `npm run dev` wrapper **orphans the vite child** and port 5173 stays busy serving stale code. After stopping, check `netstat -ano | grep 517` and `taskkill //F //PID <pid>`.

## Architecture

- `src/App.svelte` — no router: a `screen` state variable + `{#key}` remount; screens remount on every tab switch. 6 dock tabs + sub-screens opened from «المزيد».
- `src/lib/db.js` — **the entire data layer** (Dexie/IndexedDB, schema v4): products, sales, movements, reservations, occasions, expenses, append-only `vault` (profit ledger), settings key/value. All entities and migrations live here; screens never query raw tables for writes.
- `src/lib/utils.js` — Baghdad time (UTC+3, DST-proof helpers), `iqd()` money shorthand, WhatsApp message builders, `stockArrival/shelfAgeDays` (راكد clock). Never use device-local time; every "today" boundary is Baghdad.
- `src/lib/store.js` — UI-only stores (toasts, confirm, cross-screen intents like `invoicePreset`, shared filters).
- `src/lib/motion.js` — sparks/springs/longpress; everything must respect `reducedMotion()`.
- Screens: `src/lib/screens/*.svelte` (Inventory, Sell, Dashboard, Reports, SalesLog, DeliveryLedger, Customers, Suppliers, ProductForm, ItemDetail, …). Screens poll the DB with `setInterval` (4–5s) inside `$effect`.

## Domain rules (do not break)

- **نفد is model-wide.** A model = all color×size cards sharing `modelGroupKey` (`modelId`). The `oosSince` stamp lands on every card only when the whole model is empty (`syncModelOos`); a single zeroed size is a "hole" (فقرة), never نفد. Consumers (dashboard alert, Reports نفد card, المدينة القديمة) count fully-empty models only.
- **Money**: `iqd()` reads typed values as thousands (5 → 5,000 د.ع). Delivery fees belong to the customer→company and never enter boutique profit. Every completed sale auto-deposits its profit into `vault`; returns withdraw.
- **Time**: settable arrival time (`createdAt`) is respected by sort, راكد, month ledger — never overwrite `createdAt` on merge/restock; `restockedAt` restarts the راكد clock only on real qty increases.
- **Settings must be read live** (in the polling grab or at point-of-use) — never once at mount/boot. This exact bug shipped before (v0.15.2).
- **Photo is the product's identity** — no user-facing model names; the auto name is internal only.

## Component & style conventions

- `Glass` creates its host element → caller scoped CSS **cannot** see the host; style hosts with `:global(.class)`, inner elements normally.
- `Pick` prop is `valOf` (not `valueOf`). `Glass` applies the `longpress` action itself when you pass `onlongpress` — do **not** also pass `action={longpress}` (double-fire bug).
- UI language: Arabic, feminine address (اختاري/اضغطي), digits always 1234 (`fmtNum`), currency د.ع, month names Arabic. Brand palette: burgundy `#B5495B`, deep `#7A2E3A`, gold `#C9A15A`, ivory `#FBF3EE`, taupe `#9C7B6B`; glassmorphism, gold-thread motif.
- Cart persists in `localStorage` (`ghazala.sell.cart`, `ghazala.sell.lastCart`); cart bar/FAB are portaled to `<body>` (cleanup on unmount is load-bearing).

## Ship sequence (owner's standing order)

For every feature/fix batch: **preview live in the browser → add a version entry to `README.md` (it is the full Arabic changelog, versioning scheme at its top) → bump `package.json` version → short commit sentence → push to `main`** (deploys automatically).

## Reference docs

- `README.md` — features + complete changelog; read the latest entries before touching a screen.
- `Ghazala Boutique (Profile).md` — brand identity.
- Dev-only browser profile contains demo seed data and test PIN `1234` — never touch the owner's real device data (all local anyway).
