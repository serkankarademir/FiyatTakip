import dns from 'dns/promises';
import {
  isTargetPriceReached,
  normalizeProductUrl,
  shouldTriggerPriceDropNotification,
  validatePriceData,
} from '../shared/priceUtils';
import { extractProductSpecs } from '../shared/productMatcher';
import {
  AnalyzedProductCandidate,
  AvailabilityState,
  NotificationRecord,
  OfferRecord,
  ProductRecord,
} from '../shared/types';
import {
  addSystemLog,
  createProductWithOffers,
  getAllProducts,
  getAllStores,
  getDb,
  getProductById,
  getUserSettings,
  persistDb,
  updateStoreStatus,
} from './database';
import { dispatchNotification } from './notificationService';
import {
  extractIdentityFromUrlSlug,
  getAllStoreAdapters,
  getStoreAdapterById,
  getStoreAdapterByUrl,
  resolveCanonicalProductUrl,
  TrendyolAdapter,
} from './storeAdapters';

/**
 * Checks whether the machine currently has an active internet connection (Section 17).
 */
export async function checkInternetConnection(): Promise<boolean> {
  try {
    await dns.lookup('www.google.com');
    return true;
  } catch {
    try {
      await dns.lookup('www.trendyol.com');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Analyzes a pasted product URL and searches other enabled Turkish stores for matching offers.
 */
export async function analyzeProductUrl(rawUrl: string): Promise<AnalyzedProductCandidate> {
  const normInitial = normalizeProductUrl(rawUrl);
  if (!normInitial.isValid) {
    throw new Error(normInitial.error || 'Geçersiz ürün bağlantısı.');
  }

  const online = await checkInternetConnection();
  if (!online) {
    throw new Error('İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.');
  }

  // Resolve short links (e.g. amzn.eu, ty.gl, app.hb.biz) to full canonical URLs
  const canonicalUrl = await resolveCanonicalProductUrl(normInitial.normalizedUrl);
  const norm = normalizeProductUrl(canonicalUrl);
  const effectiveUrl = norm.isValid ? norm.normalizedUrl : normInitial.normalizedUrl;
  const effectiveDomain = norm.isValid ? norm.domain : normInitial.domain;

  const matchedAdapter =
    getStoreAdapterByUrl(effectiveUrl) || getStoreAdapterByUrl(normInitial.normalizedUrl);
  const primaryAdapter = matchedAdapter || new TrendyolAdapter();
  const storeId = matchedAdapter ? matchedAdapter.storeId : 'trendyol';
  const storeName = matchedAdapter ? matchedAdapter.storeName : effectiveDomain;

  await addSystemLog('INFO', 'PRICE_CHECK', `Ürün bağlantısı analiz ediliyor: ${effectiveUrl}`, {
    storeName,
  });

  const details = await primaryAdapter.getProductDetails(effectiveUrl);
  const slugFallback = extractIdentityFromUrlSlug(effectiveUrl);

  const productTitle =
    details.title && details.title !== 'Bilinmeyen Ürün'
      ? details.title
      : slugFallback.title;

  const specs = extractProductSpecs(productTitle, {
    brand: details.brand || slugFallback.brand,
    sku: details.sku || slugFallback.sku,
    ean: details.ean,
  });

  // Search other enabled stores in bounded concurrency batches
  const allStores = await getAllStores();
  const enabledStoreIds = new Set(allStores.filter((s) => s.enabled).map((s) => s.id));
  const otherAdapters = getAllStoreAdapters().filter(
    (a) => a.storeId !== storeId && enabledStoreIds.has(a.storeId)
  );

  const searchQuery =
    [specs.brand, specs.model, specs.storage, specs.color]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    (productTitle !== 'Bilinmeyen Ürün' ? productTitle : specs.sku || slugFallback.sku);

  const otherStoreOffers: AnalyzedProductCandidate['otherStoreOffers'] = [];
  const batchSize = 4;

  if (searchQuery) {
    for (let i = 0; i < otherAdapters.length; i += batchSize) {
      const batch = otherAdapters.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((adapter) => adapter.searchProduct(searchQuery, productTitle, specs))
      );
      otherStoreOffers.push(...batchResults);
    }
  }

  // If the primary store blocked direct scraping, check if any high/exact match verified offer was found
  const verifiedCrossStoreOffers = otherStoreOffers
    .filter(
      (o) =>
        o.status === 'verified' &&
        o.price !== null &&
        o.price > 0 &&
        (o.matchConfidence === 'Kesin eşleşme' || o.matchConfidence === 'Yüksek eşleşme')
    )
    .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

  const bestFallbackOffer = verifiedCrossStoreOffers[0];
  const resolvedPrice =
    details.isVerifiedFromPage && details.price !== null
      ? details.price
      : bestFallbackOffer?.price ?? null;
  const isVerified =
    (details.isVerifiedFromPage && details.price !== null) || Boolean(bestFallbackOffer);

  await addSystemLog(
    'INFO',
    'PRODUCT_MATCH',
    `Ürün analizi tamamlandı: "${productTitle}" (${otherStoreOffers.filter((o) => o.status === 'verified').length} mağazada fiyat doğrulandı)`,
    {
      productTitle,
      primaryPrice: resolvedPrice,
      verifiedStores: otherStoreOffers.filter((o) => o.status === 'verified').length,
    }
  );

  return {
    url: rawUrl,
    normalizedUrl: effectiveUrl,
    storeId,
    storeName,
    name:
      productTitle === 'Bilinmeyen Ürün' && bestFallbackOffer?.title
        ? bestFallbackOffer.title
        : productTitle,
    brand: specs.brand || details.brand || 'Belirtilmemiş',
    model: specs.model || details.model || productTitle,
    productCode: specs.productCode || details.sku || slugFallback.sku || '',
    ean: specs.ean || details.ean || '',
    price: resolvedPrice,
    currency: details.currency || 'TRY',
    seller:
      details.isVerifiedFromPage && details.price !== null
        ? details.seller || storeName
        : bestFallbackOffer
        ? `${storeName} (${bestFallbackOffer.storeName} doğrulaması)`
        : storeName,
    availability: isVerified ? 'Stokta' : details.availability,
    image: details.image || '',
    specs,
    extractionStatus: isVerified ? 'verified' : 'blocked_or_unavailable',
    extractionMessage: isVerified
      ? undefined
      : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    otherStoreOffers,
  };
}

export interface PriceCheckSummary {
  offline: boolean;
  message: string;
  checkedProductsCount: number;
  checkedOffersCount: number;
  successfulOffersCount: number;
  failedOffersCount: number;
  priceDropsDetected: number;
  notificationsTriggered: NotificationRecord[];
  checkedAt: string;
}

/**
 * Checks prices for a single tracked product across all its store offers.
 */
export async function checkSingleProductPrices(productId: string): Promise<PriceCheckSummary> {
  const now = new Date().toISOString();
  const online = await checkInternetConnection();

  if (!online) {
    await addSystemLog(
      'WARN',
      'FAILED_CHECK',
      'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.',
      { productId }
    );
    return {
      offline: true,
      message: 'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.',
      checkedProductsCount: 0,
      checkedOffersCount: 0,
      successfulOffersCount: 0,
      failedOffersCount: 0,
      priceDropsDetected: 0,
      notificationsTriggered: [],
      checkedAt: now,
    };
  }

  const product = await getProductById(productId);
  if (!product) {
    throw new Error('Ürün bulunamadı.');
  }

  const db = await getDb();
  const settings = await getUserSettings();
  const offers = product.offers || [];

  let successfulOffersCount = 0;
  let failedOffersCount = 0;
  let priceDropsDetected = 0;
  const notificationsTriggered: NotificationRecord[] = [];

  const previousLowestPrice = product.current_lowest_price;
  const previousLowestStore = product.current_lowest_store;

  for (const offer of offers) {
    const adapter = getStoreAdapterById(offer.store_id);
    if (!adapter) continue;

    const details = await adapter.getProductDetails(offer.url);
    const checkTime = new Date().toISOString();

    if (!details.isVerifiedFromPage || details.price === null) {
      failedOffersCount++;
      // Do NOT overwrite last known price or mark as zero! (Section 17 & 52)
      db.run(
        `UPDATE offers
         SET price_status = CASE WHEN price IS NOT NULL THEN 'last_known' ELSE 'failed' END,
             checked_at = ?,
             last_error = ?
         WHERE id = ?`,
        [
          checkTime,
          'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
          offer.id,
        ]
      );
      continue;
    }

    // Validate new price before recording (Section 18)
    const validation = validatePriceData({
      newPrice: details.price,
      referencePrice: offer.price || previousLowestPrice,
      currency: details.currency,
      isProductPage: true,
      isBundleMismatch: Boolean(details.specs.isBundle) !== Boolean(product.name.toLowerCase().includes('paket')),
    });

    if (!validation.isValid) {
      failedOffersCount++;
      db.run(
        `UPDATE offers SET price_status = 'failed', checked_at = ?, last_error = ? WHERE id = ?`,
        [checkTime, validation.reason || 'Geçersiz fiyat verisi', offer.id]
      );
      continue;
    }

    if (validation.isSuspicious) {
      // Flag as suspicious ("Şüpheli fiyat") and do NOT overwrite valid price or send false drop notification
      db.run(
        `UPDATE offers
         SET price_status = 'suspicious',
             suspicious_price = ?,
             suspicious_reason = ?,
             checked_at = ?
         WHERE id = ?`,
        [
          details.price,
          validation.reason || 'Şüpheli fiyat',
          checkTime,
          offer.id,
        ]
      );
      await addSystemLog('WARN', 'PRICE_CHECK', `Şüpheli fiyat tespit edildi: ${product.name} (${details.price} TL)`, {
        offerId: offer.id,
        oldPrice: offer.price,
        suspiciousPrice: details.price,
      });
      continue;
    }

    successfulOffersCount++;
    const oldOfferPrice = offer.price;
    const oldAvailability = offer.availability;
    const newPrice = details.price;
    const newAvailability = details.availability;

    db.run(
      `UPDATE offers
       SET previous_price = CASE WHEN price IS NOT NULL AND price != ? THEN price ELSE previous_price END,
           price = ?,
           availability = ?,
           price_status = 'verified',
           suspicious_price = NULL,
           suspicious_reason = NULL,
           checked_at = ?,
           last_error = NULL
       WHERE id = ?`,
      [newPrice, newPrice, newAvailability, checkTime, offer.id]
    );

    const histId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.run(
      `INSERT INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        histId,
        offer.id,
        product.id,
        offer.store_id,
        newPrice,
        oldOfferPrice,
        details.currency,
        newAvailability,
        checkTime,
      ]
    );

    // Evaluate Notifications for this Offer
    const outcome = await evaluateOfferChangeAndNotify({
      product,
      offer,
      oldPrice: oldOfferPrice,
      newPrice,
      oldAvailability,
      newAvailability,
      previousLowestPrice,
      previousLowestStore,
      settings,
    });
    if (outcome.priceDropped) priceDropsDetected++;
    notificationsTriggered.push(...outcome.notifications);
  }

  persistDb(db);

  await addSystemLog(
    'INFO',
    'PRICE_CHECK',
    `Fiyat kontrolü tamamlandı: ${product.name} (${successfulOffersCount} başarılı, ${failedOffersCount} erişilemedi)`,
    { productId, successfulOffersCount, failedOffersCount }
  );

  return {
    offline: false,
    message:
      successfulOffersCount > 0
        ? `Son kontrol tamamlandı (${successfulOffersCount} mağaza güncellendi).`
        : 'Mağaza sayfaları otomatik erişimi engelledi. Son bilinen fiyatlar korundu.',
    checkedProductsCount: 1,
    checkedOffersCount: offers.length,
    successfulOffersCount,
    failedOffersCount,
    priceDropsDetected,
    notificationsTriggered,
    checkedAt: now,
  };
}

/**
 * Checks prices for all active tracked products (with bounded concurrency).
 */
export async function checkAllActiveProducts(): Promise<PriceCheckSummary> {
  const now = new Date().toISOString();
  const online = await checkInternetConnection();
  if (!online) {
    return {
      offline: true,
      message: 'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.',
      checkedProductsCount: 0,
      checkedOffersCount: 0,
      successfulOffersCount: 0,
      failedOffersCount: 0,
      priceDropsDetected: 0,
      notificationsTriggered: [],
      checkedAt: now,
    };
  }

  const allProducts = await getAllProducts();
  const activeProducts = allProducts.filter((p) => p.active);

  let checkedOffersCount = 0;
  let successfulOffersCount = 0;
  let failedOffersCount = 0;
  let priceDropsDetected = 0;
  const notificationsTriggered: NotificationRecord[] = [];

  for (const product of activeProducts) {
    const res = await checkSingleProductPrices(product.id);
    checkedOffersCount += res.checkedOffersCount;
    successfulOffersCount += res.successfulOffersCount;
    failedOffersCount += res.failedOffersCount;
    priceDropsDetected += res.priceDropsDetected;
    notificationsTriggered.push(...res.notificationsTriggered);
  }

  return {
    offline: false,
    message: `${activeProducts.length} ürün için fiyat kontrolü tamamlandı.`,
    checkedProductsCount: activeProducts.length,
    checkedOffersCount,
    successfulOffersCount,
    failedOffersCount,
    priceDropsDetected,
    notificationsTriggered,
    checkedAt: now,
  };
}

async function evaluateOfferChangeAndNotify(params: {
  product: ProductRecord;
  offer: OfferRecord;
  oldPrice: number | null;
  newPrice: number;
  oldAvailability: AvailabilityState;
  newAvailability: AvailabilityState;
  previousLowestPrice: number | null;
  previousLowestStore: string | null;
  settings: Awaited<ReturnType<typeof getUserSettings>>;
}): Promise<{ priceDropped: boolean; notifications: NotificationRecord[] }> {
  const {
    product,
    offer,
    oldPrice,
    newPrice,
    oldAvailability,
    newAvailability,
    previousLowestPrice,
    previousLowestStore,
    settings,
  } = params;

  const notifications: NotificationRecord[] = [];
  let priceDropped = false;

  // 1. Check Restock: Tükendi -> Stokta (Section 12.4 & 44)
  if (
    oldAvailability === 'Tükendi' &&
    newAvailability === 'Stokta' &&
    settings.notifyOnRestock
  ) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: 'restock',
      oldPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url,
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }

  // 2. Check Target Price Reached (Section 11 & 12.2)
  if (
    settings.notifyOnTargetReached &&
    product.target_price &&
    isTargetPriceReached(newPrice, product.target_price)
  ) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: 'target_reached',
      oldPrice: oldPrice || previousLowestPrice || newPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url,
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }

  // 3. Check Price Decrease (Section 12.1 & 14)
  if (oldPrice !== null && oldPrice > 0 && newPrice < oldPrice) {
    priceDropped = true;
    const shouldNotify = shouldTriggerPriceDropNotification({
      oldPrice,
      newPrice,
      ruleType: settings.dropRuleType,
      minDropPercent: settings.minDropPercent,
      minDropAmount: settings.minDropAmount,
    });

    if (shouldNotify) {
      const isNewLowestStore =
        previousLowestPrice !== null &&
        newPrice < previousLowestPrice &&
        previousLowestStore !== null &&
        previousLowestStore !== offer.store_name;

      const dispatched = await dispatchNotification({
        productId: product.id,
        productName: product.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: isNewLowestStore ? 'new_lowest_store' : 'price_drop',
        oldPrice,
        newPrice,
        currency: product.currency,
        productUrl: offer.url,
      });
      if (dispatched.notification) notifications.push(dispatched.notification);
    }
  }

  // 4. Check Price Increase (Section 43)
  if (
    oldPrice !== null &&
    oldPrice > 0 &&
    newPrice > oldPrice &&
    settings.notifyOnPriceIncrease
  ) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: 'price_increase',
      oldPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url,
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }

  return { priceDropped, notifications };
}

/**
 * Background Scheduler (Section 15 & 16)
 */
let schedulerTimer: NodeJS.Timeout | null = null;
let lastScheduledRunTimestamp = 0;
let lastScheduledDateTag = '';

export function startBackgroundScheduler(): void {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(async () => {
    try {
      const settings = await getUserSettings();
      if (settings.checkFrequency === 'manual') return;

      const now = new Date();
      const nowMs = now.getTime();
      const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
      const dateTag = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

      let shouldRun = false;

      switch (settings.checkFrequency) {
        case 'daily_1':
          if (currentHHMM === settings.preferredCheckTime && lastScheduledDateTag !== dateTag) {
            shouldRun = true;
            lastScheduledDateTag = dateTag;
          }
          break;
        case 'daily_2':
          if (nowMs - lastScheduledRunTimestamp >= 12 * 3600_000) shouldRun = true;
          break;
        case 'daily_4':
        case 'every_6h':
          if (nowMs - lastScheduledRunTimestamp >= 6 * 3600_000) shouldRun = true;
          break;
        case 'every_3h':
          if (nowMs - lastScheduledRunTimestamp >= 3 * 3600_000) shouldRun = true;
          break;
      }

      if (shouldRun) {
        lastScheduledRunTimestamp = nowMs;
        await addSystemLog(
          'INFO',
          'SYSTEM',
          `Zamanlanmış arka plan fiyat kontrolü başlatıldı (${settings.checkFrequency})`
        );
        await checkAllActiveProducts();
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  }, 60_000);
}

/**
 * Developer / Test Mode Simulation Actions (Section 38 & 47)
 * Clearly separated from production scraping. Only invocable when Developer Mode is enabled.
 */
export async function seedDeveloperSampleProducts(): Promise<ProductRecord[]> {
  const db = await getDb();
  const existing = await getAllProducts();
  if (existing.length > 0) {
    return existing;
  }

  // Create Sony WH-1000XM5 with multi-store historical data matching the specification examples
  const p1 = await createProductWithOffers({
    name: 'Sony WH-1000XM5 Kablosuz Gürültü Engelleme Özellikli Kulaklık Siyah',
    brand: 'Sony',
    model: 'WH-1000XM5',
    productCode: 'WH1000XM5B.CE7',
    ean: '4548736132580',
    image: '',
    originalUrl: 'https://www.trendyol.com/sony/wh-1000xm5-kablosuz-kulaklik-siyah-p-31245678',
    targetPrice: 9000,
    currency: 'TRY',
    storage: '',
    ram: '',
    color: 'Siyah',
    size: '',
    generation: 'XM5',
    offers: [
      {
        storeId: 'trendyol',
        url: 'https://www.trendyol.com/sony/wh-1000xm5-kablosuz-kulaklik-siyah-p-31245678',
        seller: 'Trendyol',
        price: 9249,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Kesin eşleşme',
        matchScore: 100,
        matchTitle: 'Sony WH-1000XM5 Kablosuz Gürültü Engelleme Özellikli Kulaklık Siyah',
        priceStatus: 'verified',
      },
      {
        storeId: 'hepsiburada',
        url: 'https://www.hepsiburada.com/sony-wh-1000xm5-kablosuz-kulaklik-siyah-pm-HBC00002abc',
        seller: 'Hepsiburada',
        price: 9499,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Kesin eşleşme',
        matchScore: 98,
        matchTitle: 'Sony WH-1000XM5 Siyah Kablosuz Bluetooth Kulaklık',
        priceStatus: 'verified',
      },
      {
        storeId: 'amazon_tr',
        url: 'https://www.amazon.com.tr/dp/B09Y2MYL5C',
        seller: 'Amazon Türkiye',
        price: 9799,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Yüksek eşleşme',
        matchScore: 92,
        matchTitle: 'Sony WH-1000XM5 Gürültü Engelleyici Kablosuz Kulaklık, Siyah',
        priceStatus: 'verified',
      },
    ],
  });

  // Populate historical points for Sony WH-1000XM5 (01.09, 05.09, 10.09, 20.09, 29.09)
  const trendyolOffer = p1.offers?.find((o) => o.store_id === 'trendyol');
  if (trendyolOffer) {
    db.run(`UPDATE offers SET previous_price = 10499 WHERE id = ?`, [trendyolOffer.id]);
    db.run(`DELETE FROM price_history WHERE product_id = ?`, [p1.id]);

    const timeline = [
      { daysAgo: 28, price: 10499, oldPrice: null },
      { daysAgo: 24, price: 10199, oldPrice: 10499 },
      { daysAgo: 19, price: 9999, oldPrice: 10199 },
      { daysAgo: 9, price: 9499, oldPrice: 9999 },
      { daysAgo: 0, price: 9249, oldPrice: 9499 },
    ];

    for (const pt of timeline) {
      const ts = new Date(Date.now() - pt.daysAgo * 24 * 3600_000).toISOString();
      const hid = `ph_seed_${pt.daysAgo}_${Math.random().toString(36).slice(2, 7)}`;
      db.run(
        `INSERT INTO price_history (
          id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
        ) VALUES (?, ?, ?, 'trendyol', ?, ?, 'TRY', 'Stokta', 0, ?)`,
        [hid, trendyolOffer.id, p1.id, pt.price, pt.oldPrice, ts]
      );
    }
  }

  // Create Apple iPhone 16 128 GB Siyah with exact, high, and similar (256 GB) store offers
  const p2 = await createProductWithOffers({
    name: 'Apple iPhone 16 128 GB Siyah',
    brand: 'Apple',
    model: 'IPHONE 16',
    productCode: 'MYE73TU/A',
    ean: '195949821905',
    image: '',
    originalUrl: 'https://www.hepsiburada.com/apple-iphone-16-128-gb-siyah-pm-HBC00006XYZ',
    targetPrice: 58000,
    currency: 'TRY',
    storage: '128 GB',
    ram: '8 GB',
    color: 'Siyah',
    size: '',
    generation: 'iphone 16',
    offers: [
      {
        storeId: 'hepsiburada',
        url: 'https://www.hepsiburada.com/apple-iphone-16-128-gb-siyah-pm-HBC00006XYZ',
        seller: 'Hepsiburada',
        price: 59999,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Kesin eşleşme',
        matchScore: 100,
        matchTitle: 'Apple iPhone 16 128 GB Siyah',
        priceStatus: 'verified',
      },
      {
        storeId: 'trendyol',
        url: 'https://www.trendyol.com/apple/iphone-16-128-gb-siyah-p-85412369',
        seller: 'Trendyol',
        price: 60499,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Kesin eşleşme',
        matchScore: 98,
        matchTitle: 'Apple iPhone 16 128 GB Siyah Cep Telefonu (Apple Türkiye Garantili)',
        priceStatus: 'verified',
      },
      {
        storeId: 'mediamarkt',
        url: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-256-gb-siyah-123456.html',
        seller: 'MediaMarkt Türkiye',
        price: 64999,
        currency: 'TRY',
        availability: 'Stokta',
        matchConfidence: 'Benzer ürün',
        matchScore: 68,
        matchTitle: 'Apple iPhone 16 256 GB Siyah (Farklı Kapasite — Otomatik Karşılaştırma Dışı)',
        priceStatus: 'verified',
      },
    ],
  });

  const hbOffer = p2.offers?.find((o) => o.store_id === 'hepsiburada');
  if (hbOffer) {
    db.run(`UPDATE offers SET previous_price = 62999 WHERE id = ?`, [hbOffer.id]);
    const tsOld = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
    db.run(
      `INSERT INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, 'hepsiburada', 62999, NULL, 'TRY', 'Stokta', 0, ?)`,
      [`ph_seed_ip16_old`, hbOffer.id, p2.id, tsOld]
    );
  }

  await updateStoreStatus({ storeId: 'trendyol', status: 'operational' });
  await updateStoreStatus({ storeId: 'hepsiburada', status: 'operational' });
  await updateStoreStatus({ storeId: 'amazon_tr', status: 'operational' });
  await updateStoreStatus({ storeId: 'mediamarkt', status: 'operational' });
  persistDb(db);

  await dispatchNotification({
    productId: p1.id,
    productName: p1.name,
    storeId: 'trendyol',
    storeName: 'Trendyol',
    type: 'price_drop',
    oldPrice: 10499,
    newPrice: 9249,
    currency: 'TRY',
    productUrl: p1.original_url,
  });

  return getAllProducts();
}

export async function runDeveloperSimulation(params: {
  simulationType:
    | 'price_drop'
    | 'price_increase'
    | 'target_reached'
    | 'out_of_stock'
    | 'restock'
    | 'store_failure'
    | 'suspicious_price';
  productId?: string;
}): Promise<{
  message: string;
  notification: NotificationRecord | null;
}> {
  const db = await getDb();
  let products = await getAllProducts();
  if (products.length === 0) {
    products = await seedDeveloperSampleProducts();
  }

  const targetProduct =
    (params.productId ? products.find((p) => p.id === params.productId) : products[0]) ||
    products[0];
  const offer = targetProduct.offers?.[0];
  if (!offer) {
    throw new Error('Simülasyon için ürüne ait mağaza teklifi bulunamadı.');
  }

  const now = new Date().toISOString();
  const currentPrice = offer.price || 10000;
  const settings = await getUserSettings();

  switch (params.simulationType) {
    case 'price_drop': {
      const newPrice = Math.max(100, Math.round(currentPrice * 0.88));
      db.run(
        `UPDATE offers SET previous_price = ?, price = ?, price_status = 'verified', checked_at = ? WHERE id = ?`,
        [currentPrice, newPrice, now, offer.id]
      );
      db.run(
        `INSERT INTO price_history (id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Stokta', 0, ?)`,
        [
          `ph_sim_${Date.now()}`,
          offer.id,
          targetProduct.id,
          offer.store_id,
          newPrice,
          currentPrice,
          targetProduct.currency,
          now,
        ]
      );
      persistDb(db);

      const notif = await dispatchNotification({
        productId: targetProduct.id,
        productName: targetProduct.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: 'price_drop',
        oldPrice: currentPrice,
        newPrice,
        currency: targetProduct.currency,
        productUrl: offer.url,
      });

      return {
        message: `[Geliştirici Modu] Fiyat düşüşü simüle edildi: ${currentPrice.toLocaleString('tr-TR')} TL → ${newPrice.toLocaleString('tr-TR')} TL`,
        notification: notif.notification,
      };
    }

    case 'price_increase': {
      const newPrice = Math.round(currentPrice * 1.06);
      db.run(
        `UPDATE offers SET previous_price = ?, price = ?, price_status = 'verified', checked_at = ? WHERE id = ?`,
        [currentPrice, newPrice, now, offer.id]
      );
      db.run(
        `INSERT INTO price_history (id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Stokta', 0, ?)`,
        [
          `ph_sim_${Date.now()}`,
          offer.id,
          targetProduct.id,
          offer.store_id,
          newPrice,
          currentPrice,
          targetProduct.currency,
          now,
        ]
      );
      persistDb(db);

      let notification: NotificationRecord | null = null;
      if (settings.notifyOnPriceIncrease) {
        const res = await dispatchNotification({
          productId: targetProduct.id,
          productName: targetProduct.name,
          storeId: offer.store_id,
          storeName: offer.store_name,
          type: 'price_increase',
          oldPrice: currentPrice,
          newPrice,
          currency: targetProduct.currency,
          productUrl: offer.url,
        });
        notification = res.notification;
      }

      return {
        message: `[Geliştirici Modu] Fiyat artışı kaydedildi: ${currentPrice.toLocaleString('tr-TR')} TL → ${newPrice.toLocaleString('tr-TR')} TL (Normal fiyat düşüş bildirimi tetiklenmedi).`,
        notification,
      };
    }

    case 'target_reached': {
      const targetPrice = targetProduct.target_price || Math.round(currentPrice * 0.9);
      const newPrice = Math.max(100, targetPrice - 50);
      db.run(`UPDATE products SET target_price = ? WHERE id = ?`, [targetPrice, targetProduct.id]);
      db.run(
        `UPDATE offers SET previous_price = ?, price = ?, price_status = 'verified', checked_at = ? WHERE id = ?`,
        [currentPrice, newPrice, now, offer.id]
      );
      db.run(
        `INSERT INTO price_history (id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Stokta', 0, ?)`,
        [
          `ph_sim_${Date.now()}`,
          offer.id,
          targetProduct.id,
          offer.store_id,
          newPrice,
          currentPrice,
          targetProduct.currency,
          now,
        ]
      );
      persistDb(db);

      const notif = await dispatchNotification({
        productId: targetProduct.id,
        productName: targetProduct.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: 'target_reached',
        oldPrice: currentPrice,
        newPrice,
        currency: targetProduct.currency,
        productUrl: offer.url,
      });

      return {
        message: `[Geliştirici Modu] 🎯 Hedef fiyatınıza ulaşıldı! (${newPrice.toLocaleString('tr-TR')} TL <= Hedef ${targetPrice.toLocaleString('tr-TR')} TL)`,
        notification: notif.notification,
      };
    }

    case 'out_of_stock': {
      db.run(
        `UPDATE offers SET availability = 'Tükendi', checked_at = ? WHERE id = ?`,
        [now, offer.id]
      );
      persistDb(db);
      return {
        message: `[Geliştirici Modu] "${targetProduct.name}" durumu 'Tükendi' olarak işaretlendi. Son bilinen fiyat (${currentPrice.toLocaleString('tr-TR')} TL) korundu.`,
        notification: null,
      };
    }

    case 'restock': {
      db.run(
        `UPDATE offers SET availability = 'Stokta', checked_at = ? WHERE id = ?`,
        [now, offer.id]
      );
      persistDb(db);
      const notif = await dispatchNotification({
        productId: targetProduct.id,
        productName: targetProduct.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: 'restock',
        oldPrice: currentPrice,
        newPrice: currentPrice,
        currency: targetProduct.currency,
        productUrl: offer.url,
        bypassDeduplication: true,
      });
      return {
        message: `[Geliştirici Modu] "${targetProduct.name}" yeniden stokta olarak işaretlendi ve bildirim gönderildi.`,
        notification: notif.notification,
      };
    }

    case 'store_failure': {
      await updateStoreStatus({
        storeId: offer.store_id,
        status: 'unavailable',
        error: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      });
      db.run(
        `UPDATE offers SET price_status = 'last_known', last_error = 'Bu mağazanın fiyatı şu anda kontrol edilemedi.', checked_at = ? WHERE id = ?`,
        [now, offer.id]
      );
      persistDb(db);
      await addSystemLog(
        'ERROR',
        'STORE_ERROR',
        `[Simülasyon] ${offer.store_name} mağazası erişilemez durumda: Bu mağazanın fiyatı şu anda kontrol edilemedi.`
      );
      return {
        message: `[Geliştirici Modu] ${offer.store_name} mağaza hatası simüle edildi. Son bilinen fiyat korundu, sahte fiyat üretilmedi.`,
        notification: null,
      };
    }

    case 'suspicious_price': {
      const suspiciousPrice = 10; // e.g. 10.000 TL -> 10 TL parser error
      db.run(
        `UPDATE offers
         SET price_status = 'suspicious',
             suspicious_price = ?,
             suspicious_reason = ?,
             checked_at = ?
         WHERE id = ?`,
        [
          suspiciousPrice,
          `Şüpheli fiyat: Normal fiyat (${currentPrice.toLocaleString('tr-TR')} TL) iken 10 TL algılandı. Otomatik bildirim engellendi.`,
          now,
          offer.id,
        ]
      );
      persistDb(db);
      await addSystemLog(
        'WARN',
        'PRICE_CHECK',
        `Şüpheli fiyat engellendi: ${targetProduct.name} (${currentPrice} TL -> 10 TL)`
      );
      return {
        message: `[Geliştirici Modu] Şüpheli fiyat (10 TL) algılandı ve 'Şüpheli fiyat' olarak işaretlendi. Yanlış fiyat düşüşü bildirimi engellendi.`,
        notification: null,
      };
    }
  }
}
