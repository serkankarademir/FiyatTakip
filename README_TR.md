# Fiyat Takip Agent — Kullanıcı ve Web Dağıtım Kılavuzu (Web & Masaüstü)

**Fiyat Takip Agent**, Türkiye’deki e-ticaret sitelerindeki ürün fiyatlarını otomatik olarak takip eden, mağazalar arası fiyat karşılaştırması yapan ve fiyat düştüğünde size bildirim gönderen hem **Web Uygulaması (React/Vite + Express + SQLite)** hem de **Masaüstü Uygulaması (Electron — macOS / Windows)** olarak çalışabilen bir platformdur.

---

## 1. Özellikler

- **Otomatik Ürün Analizi**: Ürün bağlantısını yapıştırdığınızda ürün adını, markasını, modelini, ürün kodunu (SKU) ve güncel fiyatını otomatik tespit eder.
- **Desteklenen Mağazalar**:
  - Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe, Cimri.
- **Akıllı Ürün Eşleştirme**: Aynı modelin farklı kapasite veya varyantlarını (`iPhone 16 128 GB` ile `iPhone 16 256 GB` veya `iPhone 16 Pro`) birbirine karıştırmaz. Eşleşme güvenini **“Kesin eşleşme”**, **“Yüksek eşleşme”** ve **“Benzer ürün”** olarak gösterir.
- **Sunucu Tabanlı Arka Plan Fiyat Takibi**:
  - Fiyat kontrolleri tarayıcı sekmesine bağlı kalmadan doğrudan Express sunucusu üzerinde zamanlanmış olarak (`startBackgroundScheduler()`) yürütülür.
- **Bildirim Kanalları**:
  - Web Tarayıcı & Uygulama İçi Bildirimler / Masaüstü Bildirimleri
  - Telegram Bot Bildirimleri (`TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID`)
  - E-posta Bildirimleri

---

## 2. Web Dağıtımı (Web Deployment)

### 1. Bağımlılıkları Yükleme
```bash
npm install
```

### 2. Web Uygulamasını Derleme
```bash
npm run build:web
```
Bu komut React/Vite önyüzünü `dist/` klasörüne (`dist/index.html` ve `dist/assets/*`) derler ve Express sunucusunu `server.js` olarak paketler.

### 3. Üretim (Production) Sunucusunu Başlatma
```bash
NODE_ENV=production npm run start:prod
```

### 4. Ortam Değişkenleri (`.env.example`)
- `NODE_ENV`: Çalışma modu (`production` veya `development`)
- `PORT`: Sunucu portu (Render tarafından otomatik atanır, varsayılan `3000`)
- `CORS_ORIGIN`: İsteğe bağlı izin verilen çapraz kaynak adresleri (aynı alan adından sunulan üretim kurulumlarında boş bırakılabilir)
- `DATABASE_PATH`: SQLite veritabanı dosya yolu (varsayılan `./data/fiyat_takip.sqlite`)
- `ENCRYPTION_KEY`: İsteğe bağlı AES-256-GCM kasa şifreleme anahtarı
- `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID`: İsteğe bağlı Telegram bildirim bilgileri
- `NOTIFICATION_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: İsteğe bağlı e-posta bildirim ayarları

### 5. Render Dağıtım Ayarları
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build:web`
- **Start Command:** `npm run start:prod`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `DATABASE_PATH=/var/data/fiyat_takip.sqlite`

### 6. SQLite Veritabanı Kalıcılığı ve Kalıcı Disk (Persistent Disk) Uyarısı
- Uygulama verilerini `sql.js` / SQLite veritabanı dosyasında (`DATABASE_PATH`) saklar.
- **Önemli Bulut Depolama Uyarısı:** Render ve benzeri bulut platformlarında varsayılan konteyner dosya sistemi geçicidir (ephemeral). Kalıcı bir disk tanımlanmadığında uygulama ilk testler için sorunsuz çalışır ancak sunucu yeniden başlatıldığında veya yeni sürüm dağıtıldığında yerel diskteki veriler sıfırlanır.
- Üretim ortamında verilerin yeniden başlatmalar arasında korunması için mutlaka bir **Kalıcı Disk (Persistent Disk / Volume)** bağlanmalı (örneğin `/var/data` dizinine) ve `DATABASE_PATH=/var/data/fiyat_takip.sqlite` olarak ayarlanmalıdır. Ayrıca **Ayarlar > Veri** sekmesinden (`/api/data/export-json` ve `/api/data/import-json`) istediğiniz zaman JSON yedek alabilir ve geri yükleyebilirsiniz.

### 7. Sağlık Kontrolü (Health Check)
- **Uç Nokta:** `GET /api/health`
- **Yanıt:** `{"status":"ok","service":"FiyatTakip","environment":"production"}`

---

## 3. Masaüstü Uygulaması (Electron — macOS & Windows)

Masaüstü paketlerini oluşturmak için:
```bash
npm install --save-dev electron electron-builder
npm run electron:dev   # Masaüstü geliştirme modu
npm run electron:pack  # macOS .app uygulama paketi
npm run electron:dmg   # macOS .dmg kurulum imajı
npm run electron:win   # Windows .exe kurulum ve taşınabilir paket
```
