# Fiyat Takip Agent — Kullanıcı Kılavuzu

**Fiyat Takip Agent**, Türkiye’deki e-ticaret sitelerindeki ürün fiyatlarını otomatik olarak takip eden, mağazalar arası fiyat karşılaştırması yapan ve fiyat düştüğünde size bildirim gönderen bir macOS (Apple Silicon ve Intel) masaüstü uygulamasıdır.

---

## 1. Özellikler

- **Otomatik Ürün Analizi**: Ürün bağlantısını yapıştırdığınızda ürün adını, markasını, modelini, ürün kodunu (SKU) ve güncel fiyatını otomatik tespit eder.
- **Desteklenen Mağazalar**:
  - Trendyol
  - Hepsiburada
  - Amazon Türkiye
  - N11
  - ÇiçekSepeti
  - MediaMarkt Türkiye
  - Teknosa
  - Vatan Bilgisayar
  - Pazarama
  - Akakçe
  - Cimri
- **Akıllı Ürün Eşleştirme**: Aynı modelin farklı kapasite veya varyantlarını (`iPhone 16 128 GB` ile `iPhone 16 256 GB` veya `iPhone 16 Pro`) birbirine karıştırmaz. Eşleşme güvenini **“Kesin eşleşme”**, **“Yüksek eşleşme”** ve **“Benzer ürün”** olarak gösterir.
- **Hedef Fiyat ve Fiyat Düşüş Kuralları**:
  - Hedef fiyat belirleyebilir (**“🎯 Hedef fiyatınıza ulaşıldı!”**) veya sadece belirli bir yüzde (`%X`) ya da TL tutarı üzerindeki düşüşlerde bildirim almayı seçebilirsiniz.
- **Bildirim Kanalları**:
  - macOS Yerel Bildirimleri
  - Telegram Bot Bildirimleri (`Bot Token` ve `Chat ID`)
  - E-posta Bildirimleri
- **Arka Planda Çalışma ve Menü Çubuğu**:
  - **“Arka planda çalış”** seçeneği açıkken pencereyi kapatsanız bile uygulama macOS menü çubuğunda çalışmaya ve zamanlanmış fiyat kontrollerini yapmaya devam eder.
- **Veri Gizliliği**:
  - Hesap oluşturmanız gerekmez. Tüm takip verileriniz bilgisayarınızda yerel SQLite veritabanında (`data/fiyat_takip.sqlite`) saklanır.

---

## 2. Kurulum ve Çalıştırma

### Taşınabilir macOS Uygulaması (.app / .dmg)
1. `Fiyat-Takip-Agent.dmg` dosyasını açın ve **Fiyat Takip Agent.app** uygulamasını **Uygulamalar (Applications)** klasörüne sürükleyin (veya doğrudan çalıştırın).
2. Herhangi bir Python, Node.js, Homebrew veya Terminal kurulumu gerektirmez.

### Geliştirme Ortamında Çalıştırma
```bash
npm install
npm run dev
```

---

## 3. Kullanım Adımları

1. Sağ üstteki **“+ Ürün Ekle”** (veya ilk açılıştaki **“İlk Ürünü Ekle”**) düğmesine tıklayın.
2. **“Ürün bağlantısını yapıştırın”** alanına takip etmek istediğiniz ürünün adresini yapıştırıp **“Ürünü Analiz Et”** düğmesine basın.
3. Algılanan ürün bilgilerini ve isteğe bağlı **Hedef Fiyat** değerini kontrol edip **“Takibe Ekle”** düğmesine tıklayın.
4. **Ayarlar > Fiyat Kontrolü** bölümünden günlük kontrol sıklığını (`Günde 1 kez`, `Her gün 09:00` vb.) ve bildirim tercihlerinizi yapılandırın.

---

## 4. Sorun Giderme ve Mağaza Erişim Kısıtlamaları

- **“Bu mağazanın fiyatı şu anda kontrol edilemedi.” Uyarısı**:
  Bazı e-ticaret siteleri zaman zaman CAPTCHA, Cloudflare güvenlik duvarı veya bölgesel erişim kısıtlamaları uygulayabilir. Uygulama güvenlik kurallarına saygı duyar ve erişilemeyen mağazalar için **asla sahte veya tahmini fiyat üretmez**. Bu durumda ürünün son bilinen doğrulanmış fiyatı korunur ve bir sonraki zamanlanmış kontrolde tekrar denenir.
- **“Şüpheli fiyat” Uyarısı**:
  Mağaza sayfasındaki bir hata nedeniyle 10.000 TL değerindeki bir ürün aniden 10 TL olarak algılanırsa, uygulama yanlış bildirim göndermek yerine fiyatı **“Şüpheli fiyat”** olarak işaretler ve Ürün Detay sayfasında onayınıza sunar.
- **Yedekleme**:
  **Ayarlar > Veri** sekmesinden tüm takip listenizi **JSON** veya **CSV** olarak yedekleyebilir ve istediğiniz zaman **“Yedeği Geri Yükle”** ile geri yükleyebilirsiniz.
