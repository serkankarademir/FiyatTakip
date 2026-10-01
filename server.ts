import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import path from 'path';
import express, { NextFunction, Request, Response } from 'express';
import {
  clearAllData,
  clearSystemLogs,
  createProductWithOffers,
  deleteProduct,
  exportDatabaseBackup,
  getAllNotifications,
  getAllPriceDrops,
  getAllProducts,
  getAllStores,
  getDb,
  getProductById,
  getProductPriceHistory,
  getSystemLogs,
  getUserSettings,
  importDatabaseBackup,
  markNotificationsRead,
  resolveSuspiciousOfferPrice,
  updateProductSettings,
  updateStoreStatus,
  updateUserSettings,
} from './src/server/database';
import { dispatchNotification } from './src/server/notificationService';
import {
  analyzeProductUrl,
  checkAllActiveProducts,
  checkInternetConnection,
  checkSingleProductPrices,
  runDeveloperSimulation,
  seedDeveloperSampleProducts,
  startBackgroundScheduler,
} from './src/server/priceTrackerService';
import { getStoreAdapterById } from './src/server/storeAdapters';

// Prevent transient unhandled rejections from crashing the server in production
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function startServer() {
  await getDb();
  startBackgroundScheduler();

  const app = express();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // CORS support for API routes (Section 12 & 19)
  // In production same-origin deployments, unrestricted '*' is avoided unless explicitly configured via CORS_ORIGIN.
  app.use('/api', (req, res, next) => {
    const configuredOrigin = (process.env.CORS_ORIGIN || '').trim();
    const requestOrigin = req.headers.origin;

    if (configuredOrigin) {
      const allowedOrigins = configuredOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
      }
    } else if (process.env.NODE_ENV !== 'production' && requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 0. Health Check Endpoint (Section 16)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'FiyatTakip',
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // 1. Bootstrap / App State
  app.get('/api/bootstrap', async (_req, res) => {
    try {
      const [products, stores, notifications, priceDrops, settings, online] = await Promise.all([
        getAllProducts(),
        getAllStores(),
        getAllNotifications(),
        getAllPriceDrops(),
        getUserSettings(),
        checkInternetConnection(),
      ]);
      res.json({
        products,
        stores,
        notifications,
        priceDrops,
        settings,
        online,
        serverTime: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).json({
        error: 'Uygulama verileri yüklenirken bir hata oluştu.',
      });
    }
  });

  // 2. Analyze Product URL (Section 7)
  app.post('/api/products/analyze', async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Lütfen geçerli bir ürün bağlantısı girin.' });
        return;
      }
      const candidate = await analyzeProductUrl(url);
      res.json({ candidate });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.';
      res.status(400).json({ error: msg });
    }
  });

  // 3. Add Product to Tracking (Section 7 & 19)
  app.post('/api/products', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.originalUrl) {
        res.status(400).json({ error: 'Ürün adı ve orijinal bağlantı zorunludur.' });
        return;
      }
      const created = await createProductWithOffers({
        name: String(body.name),
        brand: String(body.brand || ''),
        model: String(body.model || ''),
        productCode: String(body.productCode || ''),
        ean: String(body.ean || ''),
        image: String(body.image || ''),
        originalUrl: String(body.originalUrl),
        targetPrice:
          body.targetPrice !== null && body.targetPrice !== undefined && Number(body.targetPrice) > 0
            ? Number(body.targetPrice)
            : null,
        currency: body.currency || 'TRY',
        storage: String(body.storage || ''),
        ram: String(body.ram || ''),
        color: String(body.color || ''),
        size: String(body.size || ''),
        generation: String(body.generation || ''),
        offers: Array.isArray(body.offers) ? body.offers : [],
      });
      res.json({ product: created });
    } catch (err) {
      console.error('Create product error:', err);
      res.status(500).json({ error: 'Ürün takibe eklenirken bir hata oluştu.' });
    }
  });

  // 4. Get Single Product Details + Price History (Section 9 & 24)
  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await getProductById(req.params.id);
      if (!product) {
        res.status(404).json({ error: 'Ürün bulunamadı.' });
        return;
      }
      const days = req.query.days ? Number(req.query.days) : undefined;
      const history = await getProductPriceHistory(req.params.id, days);
      res.json({ product, history });
    } catch {
      res.status(500).json({ error: 'Ürün detayları alınamadı.' });
    }
  });

  // 5. Update Product (Target Price, Active status)
  app.patch('/api/products/:id', async (req, res) => {
    try {
      const updated = await updateProductSettings(req.params.id, {
        targetPrice: req.body.targetPrice,
        active: req.body.active,
        name: req.body.name,
      });
      res.json({ product: updated });
    } catch {
      res.status(500).json({ error: 'Ürün ayarları güncellenemedi.' });
    }
  });

  // 6. Delete Product
  app.delete('/api/products/:id', async (req, res) => {
    try {
      await deleteProduct(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Ürün silinemedi.' });
    }
  });

  // 7. Manual Price Check for Single Product (Section 23)
  app.post('/api/products/:id/check', async (req, res) => {
    try {
      const summary = await checkSingleProductPrices(req.params.id);
      const product = await getProductById(req.params.id);
      const history = await getProductPriceHistory(req.params.id);
      res.json({ summary, product, history });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.',
      });
    }
  });

  // 8. Manual Price Check for All Active Products
  app.post('/api/check-all', async (_req, res) => {
    try {
      const summary = await checkAllActiveProducts();
      res.json({ summary });
    } catch {
      res.status(500).json({ error: 'Toplu fiyat kontrolü sırasında hata oluştu.' });
    }
  });

  // 9. Resolve Suspicious Offer Price (Section 18)
  app.post('/api/offers/:offerId/resolve-suspicious', async (req, res) => {
    try {
      const action = req.body.action === 'approve' ? 'approve' : 'reject';
      await resolveSuspiciousOfferPrice(req.params.offerId, action);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Şüpheli fiyat işlemi tamamlanamadı.' });
    }
  });

  // 10. Stores Management & Health Check (Section 36)
  app.patch('/api/stores/:id', async (req, res) => {
    try {
      const stores = await getAllStores();
      const target = stores.find((s) => s.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: 'Mağaza bulunamadı.' });
        return;
      }
      await updateStoreStatus({
        storeId: req.params.id,
        status: target.status,
        enabled: Boolean(req.body.enabled),
      });
      res.json({ stores: await getAllStores() });
    } catch {
      res.status(500).json({ error: 'Mağaza durumu güncellenemedi.' });
    }
  });

  app.post('/api/stores/:id/health-check', async (req, res) => {
    try {
      const adapter = getStoreAdapterById(req.params.id);
      if (!adapter) {
        res.status(404).json({ error: 'Mağaza adaptörü bulunamadı.' });
        return;
      }
      const check = await adapter.healthCheck();
      res.json({ check, stores: await getAllStores() });
    } catch {
      res.status(500).json({ error: 'Mağaza bağlantı testi başarısız oldu.' });
    }
  });

  // 11. Notifications & Test Notification (Section 12 & 13)
  app.post('/api/notifications/mark-read', async (req, res) => {
    try {
      await markNotificationsRead(req.body?.id);
      res.json({ notifications: await getAllNotifications() });
    } catch {
      res.status(500).json({ error: 'Bildirimler güncellenemedi.' });
    }
  });

  app.post('/api/notifications/test', async (_req, res) => {
    try {
      const dispatched = await dispatchNotification({
        productId: null,
        productName: 'Sony WH-1000XM5 Kablosuz Kulaklık',
        storeId: 'trendyol',
        storeName: 'Trendyol',
        type: 'test',
        oldPrice: 10499,
        newPrice: 9249,
        currency: 'TRY',
        productUrl: 'https://www.trendyol.com',
        customTitle: 'Fiyat Düştü! (Test Bildirimi)',
        customMessage: 'Sony WH-1000XM5 · 10.499 TL → 9.249 TL · Düşüş: 1.250 TL (%11,91) · Mağaza: Trendyol',
        bypassDeduplication: true,
      });
      res.json({ dispatched, notifications: await getAllNotifications() });
    } catch {
      res.status(500).json({ error: 'Test bildirimi gönderilemedi.' });
    }
  });

  // 12. User Settings (Section 29)
  app.put('/api/settings', async (req, res) => {
    try {
      const settings = await updateUserSettings(req.body || {});
      res.json({ settings });
    } catch {
      res.status(500).json({ error: 'Ayarlar kaydedilemedi.' });
    }
  });

  // 13. Technical Logs (Section 31)
  app.get('/api/logs', async (req, res) => {
    try {
      const category = req.query.category ? String(req.query.category) : undefined;
      const logs = await getSystemLogs(250, category);
      res.json({ logs });
    } catch {
      res.status(500).json({ error: 'Teknik günlük kayıtları alınamadı.' });
    }
  });

  app.delete('/api/logs', async (_req, res) => {
    try {
      await clearSystemLogs();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Teknik günlük temizlenemedi.' });
    }
  });

  // 14. Backup, Restore & Clear Data (Section 25)
  app.get('/api/data/export-json', async (_req, res) => {
    try {
      const backup = await exportDatabaseBackup();
      res.json(backup);
    } catch {
      res.status(500).json({ error: 'Yedek oluşturulamadı.' });
    }
  });

  app.post('/api/data/import-json', async (req, res) => {
    try {
      const { backup, overwrite } = req.body || {};
      const result = await importDatabaseBackup(backup || {}, Boolean(overwrite));
      res.json({ result });
    } catch {
      res.status(400).json({ error: 'Yedek dosyası geçersiz veya geri yüklenemedi.' });
    }
  });

  app.post('/api/data/clear', async (_req, res) => {
    try {
      await clearAllData();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Veriler temizlenemedi.' });
    }
  });

  // 15. Developer / Test Mode Simulation Endpoints (Section 19, 38 & 47)
  // Protected in production unless explicitly enabled outside production mode.
  app.post('/api/dev/seed-samples', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        error: 'Geliştirici test uç noktaları üretim (production) ortamında devre dışıdır.',
      });
      return;
    }
    try {
      const products = await seedDeveloperSampleProducts();
      res.json({ products });
    } catch {
      res.status(500).json({ error: 'Örnek geliştirici verileri oluşturulamadı.' });
    }
  });

  app.post('/api/dev/simulate', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        error: 'Geliştirici simülasyon uç noktaları üretim (production) ortamında devre dışıdır.',
      });
      return;
    }
    try {
      const { simulationType, productId } = req.body || {};
      const outcome = await runDeveloperSimulation({
        simulationType,
        productId,
      });
      res.json(outcome);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Simülasyon çalıştırılamadı.',
      });
    }
  });

  // Return 404 JSON for unknown API routes (Section 13 & 14)
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'İstenen API uç noktası bulunamadı.' });
  });

  // Global API Error Middleware (Section 17)
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Express error:', err);
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.path.startsWith('/api')) {
      res.status(500).json({
        error: 'Sunucu tarafında beklenmeyen bir hata oluştu.',
      });
      return;
    }
    next(err);
  });

  // Vite middleware in development, static assets in production (Section 3 & 14)
  const distPath = path.join(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(503).send('Önyüz derlemesi (dist/index.html) bulunamadı. Lütfen önce "npm run build:web" komutunu çalıştırın.');
      }
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Fiyat Takip Agent sunucusu çalışıyor: http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Fiyat Takip Agent server:', err);
  process.exit(1);
});
