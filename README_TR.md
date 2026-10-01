# Fiyat Takip Agent — Kullanıcı ve Kurulum Kılavuzu (Web & Masaüstü)

**Fiyat Takip Agent**, Türkiye’deki e-ticaret sitelerindeki ürün fiyatlarını otomatik olarak takip eden, mağazalar arası fiyat karşılaştırması yapan ve fiyat düştüğünde size bildirim gönderen hem **Web Tabanlı (Bulut & Mobil PWA)** hem de **Masaüstü (macOS / Windows)** olarak çalışabilen bir uygulamadır.

---

## 1. Özellikler

- **Otomatik Ürün Analizi**: Ürün bağlantısını yapıştırdığınızda ürün adını, markasını, modelini, ürün kodunu (SKU) ve güncel fiyatını otomatik tespit eder.
- **Desteklenen Mağazalar**:
  - Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe, Cimri.
- **Akıllı Ürün Eşleştirme**: Aynı modelin farklı kapasite veya varyantlarını (`iPhone 16 128 GB` ile `iPhone 16 256 GB` veya `iPhone 16 Pro`) birbirine karıştırmaz. Eşleşme güvenini **“Kesin eşleşme”**, **“Yüksek eşleşme”** ve **“Benzer ürün”** olarak gösterir.
- **Sunucu Tabanlı 7/24 Fiyat Takibi**:
  - Web sürümünde fiyat kontrolleri tarayıcı sekmesine bağlı kalmadan doğrudan Express sunucusu üzerinde zamanlanmış olarak yürütülür.
- **Bildirim Kanalları**:
  - Web Tarayıcı & Uygulama İçi Bildirimler / Masaüstü Bildirimleri
  - Telegram Bot Bildirimleri (`TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID`)
  - E-posta Bildirimleri
- **iPhone (iOS) ve Android PWA Desteği**:
  - Safari veya Chrome üzerinden **“Ana Ekrana Ekle”** seçeneğiyle tam ekran mobil uygulama olarak kullanılabilir.

---

## 2. Web Uygulaması Olarak Çalıştırma ve Dağıtım (Render vb.)

### Yerel Geliştirme Modu
```bash
npm install
npm run dev
```
Tarayıcınızdan `http://localhost:3000` adresini açarak kullanabilirsiniz.

### Üretim (Production) Derlemesi ve Başlatma
```bash
npm install
npm run build:web
npm start
```

### Bulut Sunucu (Render) Dağıtımı ve Veritabanı Kalıcılığı
- **Build Command:** `npm install && npm run build:web`
- **Start Command:** `npm start`
- **Health Check Endpoint:** `/api/health`
- **Veritabanı Kalıcılığı (`DATABASE_PATH`):**
  Uygulama verilerini SQLite (`sql.js`) üzerinde saklar. Varsayılan olarak `./data/fiyat_takip.sqlite` dosyası kullanılır. Render gibi bulut sağlayıcılarda uygulama yeniden başlatıldığında verilerin kaybolmaması için bir **Kalıcı Disk (Persistent Disk)** ekleyip `DATABASE_PATH=/var/data/fiyat_takip.sqlite` ortam değişkenini tanımlamanız önerilir.

---

## 3. Masaüstü Uygulaması Olarak Çalıştırma (macOS & Windows)

Masaüstü (Electron) paketlerini oluşturmak için:
```bash
npm install --save-dev electron electron-builder
npm run electron:dmg   # macOS .dmg paketi
npm run electron:win   # Windows .exe paketi
```
