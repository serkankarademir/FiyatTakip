# Fiyat Takip Agent — Developer Documentation (Web & Desktop)

**Fiyat Takip Agent** supports two execution modes from the same codebase:
1. **Production Web Application (React/Vite + Express + SQLite)** — Accessible from any desktop or mobile browser (with full iOS/Android PWA support) and ready for cloud deployment (e.g., Render, Railway, Fly.io, Docker, or VPS).
2. **Desktop Application (Electron for macOS & Windows)** — Native desktop wrapper with macOS Menu Bar tray integration, background mode, and native OS notifications.

---

## 1. Architecture Overview

- **Frontend (`src/App.tsx`, `src/components/*`, `src/shared/platform.ts`)**:
  - 100% Turkish localized interface supporting Light and Dark themes, desktop browsers, mobile screens (iPhone/Android PWA), and Electron desktop mode.
  - Runtime platform detection via `isElectron()` (`src/shared/platform.ts`) isolates desktop-only features (such as macOS Menu Bar popover and login-item settings) so Electron APIs never execute in a browser.
- **Shared Core (`src/shared/*`)**:
  - `priceUtils.ts`: Turkish price parser (`"9.249,00 TL"`, `"9.249 TL"`, `"9249 TL"`, `"9.249,99₺"`), currency detection (`TRY`, `USD`, `EUR`, `GBP`), URL normalization (including `amzn.eu`, `ty.gl` short links), and suspicious price anomaly detection.
  - `productMatcher.ts`: Multi-attribute product matcher comparing Brand, Model, Generation, Variant Tier (`Pro`, `Max`, `Plus`), Storage (`128 GB` vs `256 GB`), RAM, Color, SKU, and EAN/GTIN.
- **Backend Server (`server.ts`)**:
  - Express production server binding to `0.0.0.0:${PORT}` (default `3000`).
  - Serves `/api/*` REST endpoints, `/api/health` health check, and compiled Vite static assets (`dist/`) with SPA client-side routing fallback.
- **Database Layer (`src/server/database.ts`, `src/server/cryptoVault.ts`)**:
  - Embedded WebAssembly SQLite (`sql.js`) persisted atomically to the path configured via `DATABASE_PATH` (defaults to `./data/fiyat_takip.sqlite`).
  - AES-256-GCM encryption (`cryptoVault.ts`) for sensitive credentials (`TELEGRAM_BOT_TOKEN`, `SMTP_PASS`).
- **Server-Side Price Tracker & Store Adapters (`src/server/priceTrackerService.ts`, `src/server/storeAdapters.ts`)**:
  - Runs continuously on the Node.js server independent of any browser tab or Electron window being open, with singleton guard against duplicate schedulers.
  - Supports 11 Turkish stores: Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe, Cimri.
- **Desktop Shell (`electron/main.cjs`, `electron/preload.cjs`, `electron-builder.json`)**:
  - Optional Electron wrapper for macOS (`.app`, `.dmg`) and Windows (`.exe`). No Electron dependency is required when running or deploying the web version.

---

## 2. Web Application — Development & Production

### Local Development (Web)
```bash
npm install
npm run dev
# or: npm run dev:web
```
Opens at `http://localhost:3000`.

### Production Build & Start (Web)
```bash
npm install
npm run build:web
npm start
```
- `npm run build:web` compiles the Vite React frontend into `dist/` and bundles the backend into `server.js`.
- `npm start` runs the Express server in production mode (`NODE_ENV=production`), serving both `/api/*` and the compiled `dist/` frontend.
- Health check endpoint: `GET /api/health` → `{"status":"ok","service":"FiyatTakip","environment":"production"}`.

---

## 3. Deploying to Render (or Node.js Cloud Providers)

1. Create a new **Web Service** on Render connected to this repository.
2. Configure the build and start commands:
   - **Build Command:** `npm install && npm run build:web`
   - **Start Command:** `npm start`
3. Configure **Environment Variables** (see `.env.example`):
   - `NODE_ENV=production`
   - `DATABASE_PATH=/var/data/fiyat_takip.sqlite` *(Attach a Render Persistent Disk mounted at `/var/data` so SQLite data persists across container restarts and deployments; otherwise `./data/fiyat_takip.sqlite` on an ephemeral filesystem will reset when the container is recreated).*
   - `TELEGRAM_BOT_TOKEN` & `TELEGRAM_CHAT_ID` *(Optional)*
4. Set Health Check Path to `/api/health`.

---

## 4. Desktop Application (Electron — macOS & Windows)

Install Electron packaging dependencies when building native desktop binaries on your host machine:
```bash
npm install --save-dev electron electron-builder
```

- **Run Desktop Mode in Development:** `npm run dev:desktop`
- **Build macOS `.app` Bundle:** `npm run electron:pack`
- **Build macOS `.dmg` Installer:** `npm run electron:dmg`
- **Build Windows `.exe` Installer:** `npm run electron:win`
