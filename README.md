# Fiyat Takip Agent — Developer Documentation

**Fiyat Takip Agent** is a production-grade desktop application for macOS (Apple Silicon & Intel) and Windows that monitors product prices across Turkish e-commerce stores, detects price drops, evaluates strict product matching, and delivers native macOS, Telegram, and Email notifications.

---

## 1. Architecture Overview

The application is structured with strict separation of concerns:

- **UI Layer (`src/App.tsx`, `src/components/*`)**:
  - 100% Turkish localized desktop interface supporting Light and Dark themes.
  - Views: Dashboard, Watchlist (`Takip Listem`), Price Drops (`Fiyat Düşüşleri`), Stores (`Mağazalar`), Notifications (`Bildirimler`), Settings (`Ayarlar`), Technical Logs (`Teknik Günlük`), Product Details (`ProductDetailView`), and macOS Menu Bar Tray (`MenuBarPopover`).
- **Shared Core (`src/shared/*`)**:
  - `priceUtils.ts`: Turkish price parser (`"9.249,00 TL"`, `"9.249 TL"`, `"9249 TL"`, `"9.249,99₺"`), currency detection (`TRY`, `USD`, `EUR`, `GBP`), URL normalization, and suspicious price anomaly detection.
  - `productMatcher.ts`: Multi-attribute product matcher comparing Brand, Model, Generation, Variant Tier (`Pro`, `Max`, `Plus`), Storage (`128 GB` vs `256 GB`), RAM, Color, SKU, and EAN/GTIN. Classifies offers into `Kesin eşleşme`, `Yüksek eşleşme`, `Benzer ürün`, or `Farklı ürün`.
- **Database Layer (`src/server/database.ts`, `src/server/cryptoVault.ts`)**:
  - Embedded WebAssembly SQLite (`sql.js`) persisted atomically to `data/fiyat_takip.sqlite` (zero native C++ `node-gyp` build dependencies, portable across macOS arm64, x64, and Windows).
  - Local AES-256-GCM encryption (`cryptoVault.ts`) for sensitive credentials (Telegram Bot Token, SMTP password).
- **Store Adapters (`src/server/storeAdapters.ts`)**:
  - Implements the `StoreAdapter` interface (`searchProduct`, `getProductDetails`, `getPrice`, `getAvailability`, `getProductImage`, `normalizeProduct`, `healthCheck`) for 11 Turkish stores:
    - Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe, Cimri.
- **Scheduler & Notification Service (`src/server/priceTrackerService.ts`, `src/server/notificationService.ts`)**:
  - Background interval scheduler respecting local OS time (`preferredCheckTime`), offline detection, and strict notification deduplication (`dedup_key`).
- **Desktop Shell (`electron/main.cjs`, `electron/preload.cjs`, `electron-builder.json`)**:
  - Electron main process with macOS Menu Bar tray, background mode (`Arka planda çalış`), login item management, and packaging config for `.app`, `.dmg`, and Windows `.exe`.

---

## 2. Development & Running Locally

### Start in Development Mode
```bash
npm install
npm run dev
```
The local Express + Vite server launches at `http://localhost:3000`.

### Run Automated Tests
```bash
npm test
```

---

## 3. Building & Packaging for macOS (.app / .dmg) and Windows (.exe)

Install Electron packaging dependencies when building native binaries on your host machine:
```bash
npm install --save-dev electron electron-builder
```

### Build macOS `.app` Bundle (Unpacked Portable Directory)
```bash
npm run electron:pack
```
Output is generated in `release/mac-arm64/Fiyat Takip Agent.app` (or `release/mac/` on Intel).

### Build macOS `.dmg` Disk Image (Universal / Apple Silicon / Intel)
```bash
npm run electron:dmg
```
Output is generated in `release/Fiyat-Takip-Agent-1.0.0-arm64.dmg` and `x64.dmg`.

### Build Windows `.exe` Installer & Portable Executable
```bash
npm run electron:win
```

---

## 4. Adding a New Store Adapter

1. Open `src/server/storeAdapters.ts`.
2. Create a new class extending `BaseTurkishStoreAdapter` (or implementing `StoreAdapter`):
```ts
export class YeniMagazaAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'yenimagaza';
  readonly storeName = 'Yeni Mağaza';
  readonly domain = 'yenimagaza.com.tr';
  readonly searchUrlTemplate = 'https://www.yenimagaza.com.tr/ara?q={query}';
  protected priceSelectors = ['.product-price'];
  protected titleSelectors = ['h1.product-title'];
  protected outOfStockSelectors = ['.out-of-stock'];
  protected searchItemSelectors = {
    container: '.product-item',
    title: '.title',
    price: '.price',
    link: 'a',
  };
}
```
3. Register the instance in `ADAPTER_REGISTRY` and `INITIAL_TURKISH_STORES` in `src/server/database.ts`.

---

## 5. Security, Legal Compliance & Anti-Bot Limitations

- **Zero Fabricated Prices**: If a store uses Cloudflare WAF, CAPTCHA, or JavaScript-only dynamic rendering that blocks automated HTTP inspection, the adapter never invents or estimates a price. It marks the check as unavailable (`"Bu mağazanın fiyatı şu anda kontrol edilemedi."`) and preserves the last known verified price.
- **robots.txt & Rate Limiting**: Adapters check `robots.txt` rules and enforce per-domain request intervals (`MIN_DOMAIN_INTERVAL_MS`).
- **Local Credential Encryption**: Telegram tokens and SMTP passwords are encrypted at rest with AES-256-GCM in `src/server/cryptoVault.ts`.
