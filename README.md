# Fiyat Takip Agent — Developer Documentation (Web & Desktop)

**Fiyat Takip Agent** supports two execution modes from the same repository:
1. **Production Web Application (React/Vite + Express + SQLite + Background Scheduler)** — Accessible from any browser and deployable to Node.js cloud platforms such as Render without requiring Electron.
2. **Desktop Application (Electron for macOS & Windows)** — Native desktop application with macOS Menu Bar tray integration, background mode, and native OS notifications.

---

## 1. Architecture Overview

- **Frontend (`src/App.tsx`, `src/components/*`, `src/shared/platform.ts`)**:
  - 100% Turkish localized interface supporting Light and Dark themes, desktop browsers, mobile screens (PWA), and Electron desktop mode.
  - Runtime platform detection via `isElectron()` (`src/shared/platform.ts`) isolates desktop-only features so Electron APIs never execute in a normal web browser.
- **Shared Core (`src/shared/*`)**:
  - `priceUtils.ts`: Turkish price parser (`"9.249,00 TL"`, `"9.249 TL"`, `"9249 TL"`, `"9.249,99₺"`), currency detection (`TRY`, `USD`, `EUR`, `GBP`), URL normalization, and suspicious price anomaly detection.
  - `productMatcher.ts`: Multi-attribute product matcher comparing Brand, Model, Generation, Variant Tier (`Pro`, `Max`, `Plus`), Storage (`128 GB` vs `256 GB`), RAM, Color, SKU, and EAN/GTIN.
- **Backend Server (`server.ts`)**:
  - Express production server binding to `0.0.0.0:${PORT}` (default `3000`).
  - Serves `/api/*` REST endpoints, `/api/health` health check, and compiled Vite static assets (`dist/`) with SPA client-side routing fallback.
- **Database Layer (`src/server/database.ts`, `src/server/cryptoVault.ts`)**:
  - Embedded WebAssembly SQLite (`sql.js`) persisted atomically to the path configured via `DATABASE_PATH` (defaults to `./data/fiyat_takip.sqlite`).
  - AES-256-GCM encryption (`cryptoVault.ts`) for sensitive credentials (`TELEGRAM_BOT_TOKEN`, `SMTP_PASS`).
- **Server-Side Price Tracker & Store Adapters (`src/server/priceTrackerService.ts`, `src/server/storeAdapters.ts`)**:
  - Runs continuously on the Node.js server (`startBackgroundScheduler()`) independent of any browser tab or Electron window being open, with a singleton guard preventing duplicate scheduler instances.
  - Supports 11 Turkish stores: Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe, Cimri.
- **Desktop Shell (`electron/main.cjs`, `electron/preload.cjs`, `electron-builder.json`)**:
  - Electron wrapper for macOS (`.app`, `.dmg`) and Windows (`.exe`).

---

## 2. Web Deployment

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Web Application
```bash
npm run build:web
```
This compiles the React/Vite frontend into `dist/` (including `dist/index.html` and `dist/assets/*`) and bundles the Express backend into `server.js`.

### 3. Start Production Server
```bash
NODE_ENV=production npm run start:prod
```
The Express server listens on `0.0.0.0:${PORT}` (defaults to `3000` when `PORT` is not set), serves the compiled `dist/` frontend, initializes the SQLite database, and starts a single background price-tracking scheduler instance.

### 4. Environment Variables (`.env.example`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime mode (`development` or `production`) | `development` |
| `PORT` | HTTP port bound on `0.0.0.0` (automatically supplied by Render) | `3000` |
| `CORS_ORIGIN` | Optional comma-separated allowed origins for cross-origin requests (leave empty for same-origin deployment) | *(empty)* |
| `DATABASE_PATH` | File path for persistent SQLite database file | `./data/fiyat_takip.sqlite` |
| `ENCRYPTION_KEY` | Optional secret seed for AES-256-GCM credential encryption | Auto-generated in data dir |
| `TELEGRAM_BOT_TOKEN` | Optional server-side Telegram Bot token | *(empty)* |
| `TELEGRAM_CHAT_ID` | Optional server-side Telegram Chat ID | *(empty)* |
| `NOTIFICATION_EMAIL_TO` | Optional recipient email address | *(empty)* |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Optional SMTP server settings | `smtp.gmail.com` / `587` |

### 5. Render Deployment Configuration
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build:web`
- **Start Command:** `npm run start:prod`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `DATABASE_PATH=/var/data/fiyat_takip.sqlite` *(when a Persistent Disk is mounted at `/var/data`)*

### 6. SQLite Persistence & Persistent Disk Warning
- The application uses `sql.js` (SQLite) persisted to the file specified by `DATABASE_PATH` (or `./data/fiyat_takip.sqlite` by default).
- **Important Cloud Storage Warning:** Cloud hosting platforms (including Render free/ephemeral instances) use an ephemeral filesystem by default—any local file written inside the container is wiped whenever the service restarts or redeploys.
- While the application will start and run without a persistent disk for initial testing (and supports manual JSON backup/restore via `/api/data/export-json` and `/api/data/import-json`), **you must attach a Persistent Disk/Volume** (e.g., mounted at `/var/data` with `DATABASE_PATH=/var/data/fiyat_takip.sqlite`) in production so tracked products, price history, and settings survive container restarts.

### 7. Health Check Endpoint
- **Endpoint:** `GET /api/health`
- **Response:**
  ```json
  {
    "status": "ok",
    "service": "FiyatTakip",
    "environment": "production"
  }
  ```
- Configure `/api/health` as the Health Check Path in Render.

---

## 3. Local Development & Testing

```bash
npm install
npm run dev        # Start Express + Vite dev server at http://localhost:3000
npm run lint       # Run TypeScript type check (tsc --noEmit)
npm test           # Run automated test suite (vitest run)
```

---

## 4. Desktop Application (Electron — macOS & Windows)

Install Electron packaging dependencies on your desktop build machine when packaging native binaries:
```bash
npm install --save-dev electron electron-builder
```

- **Run Desktop Mode in Development:** `npm run dev:desktop` (or `npm run electron:dev`)
- **Build macOS `.app` Bundle:** `npm run electron:pack`
- **Build macOS `.dmg` Disk Image:** `npm run electron:dmg`
- **Build Windows `.exe` Installer & Portable:** `npm run electron:win`
