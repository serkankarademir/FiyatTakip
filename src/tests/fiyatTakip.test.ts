import { describe, expect, it } from 'vitest';
import {
  calculatePriceChange,
  detectCurrency,
  formatPriceTR,
  isTargetPriceReached,
  normalizeProductUrl,
  parsePriceTR,
  shouldTriggerPriceDropNotification,
  validatePriceData,
} from '../shared/priceUtils';
import {
  compareProducts,
  extractProductSpecs,
} from '../shared/productMatcher';
import {
  createProductWithOffers,
  insertNotificationRecord,
} from '../server/database';
import { extractIdentityFromUrlSlug, TrendyolAdapter } from '../server/storeAdapters';

describe('1. Turkish Price & Currency Parsing (Section 39 & 40)', () => {
  it('correctly parses Turkish price formats without confusing thousands separator with decimal point', () => {
    const p1 = parsePriceTR('9.249,00 TL');
    expect(p1.isValid).toBe(true);
    expect(p1.amount).toBe(9249);
    expect(p1.currency).toBe('TRY');

    const p2 = parsePriceTR('9.249 TL');
    expect(p2.isValid).toBe(true);
    expect(p2.amount).toBe(9249);
    expect(p2.amount).not.toBe(9.249);

    const p3 = parsePriceTR('9249 TL');
    expect(p3.isValid).toBe(true);
    expect(p3.amount).toBe(9249);

    const p4 = parsePriceTR('9.249,99₺');
    expect(p4.isValid).toBe(true);
    expect(p4.amount).toBe(9249.99);
    expect(p4.currency).toBe('TRY');

    const p5 = parsePriceTR('104.999,50 TL');
    expect(p5.isValid).toBe(true);
    expect(p5.amount).toBe(104999.5);
  });

  it('correctly detects TRY, USD, EUR, GBP currencies and formats Turkish prices', () => {
    expect(detectCurrency('9.249,00 TL')).toBe('TRY');
    expect(detectCurrency('1.299,99 $')).toBe('USD');
    expect(detectCurrency('899,00 €')).toBe('EUR');
    expect(detectCurrency('749,00 £')).toBe('GBP');

    expect(formatPriceTR(9249, 'TRY', true)).toBe('9.249,00 TL');
    expect(formatPriceTR(9249, 'TRY', false)).toBe('9.249 TL');
  });
});

describe('2. Price Change, Target Price & Notification Rules (Section 11, 14, 43)', () => {
  it('calculates price decreases and increases accurately', () => {
    const decrease = calculatePriceChange(10499, 9249, 'TRY');
    expect(decrease).not.toBeNull();
    expect(decrease?.isDecrease).toBe(true);
    expect(decrease?.diffAmount).toBe(-1250);
    expect(decrease?.diffPercent).toBeCloseTo(-11.91, 2);

    const increase = calculatePriceChange(9000, 9500, 'TRY');
    expect(increase).not.toBeNull();
    expect(increase?.isIncrease).toBe(true);
    expect(increase?.diffAmount).toBe(500);
    expect(increase?.diffPercent).toBeCloseTo(5.56, 2);
  });

  it('detects when target price is reached or fallen below', () => {
    expect(isTargetPriceReached(9000, 9000)).toBe(true);
    expect(isTargetPriceReached(8850, 9000)).toBe(true);
    expect(isTargetPriceReached(9249, 9000)).toBe(false);
  });

  it('enforces minimum percentage and amount thresholds for price drop rules', () => {
    // 10.000 TL -> 9.800 TL (-2% / -200 TL) should NOT trigger when threshold is 5%
    expect(
      shouldTriggerPriceDropNotification({
        oldPrice: 10000,
        newPrice: 9800,
        ruleType: 'percent',
        minDropPercent: 5,
        minDropAmount: 500,
      })
    ).toBe(false);

    // 10.000 TL -> 9.400 TL (-6% / -600 TL) SHOULD trigger when threshold is 5%
    expect(
      shouldTriggerPriceDropNotification({
        oldPrice: 10000,
        newPrice: 9400,
        ruleType: 'percent',
        minDropPercent: 5,
        minDropAmount: 500,
      })
    ).toBe(true);

    // Amount rule: 500 TL minimum
    expect(
      shouldTriggerPriceDropNotification({
        oldPrice: 10000,
        newPrice: 9600,
        ruleType: 'amount',
        minDropPercent: 5,
        minDropAmount: 500,
      })
    ).toBe(false);

    expect(
      shouldTriggerPriceDropNotification({
        oldPrice: 10000,
        newPrice: 9450,
        ruleType: 'amount',
        minDropPercent: 5,
        minDropAmount: 500,
      })
    ).toBe(true);
  });
});

describe('3. Product Matching Engine (Section 6)', () => {
  const refTitle = 'Apple iPhone 16 128 GB Black';

  it('matches the exact same product across Turkish and English color naming', () => {
    const res = compareProducts(refTitle, 'Apple iPhone 16 128 GB Siyah Cep Telefonu');
    expect(res.confidence).toBe('Kesin eşleşme');
    expect(res.includeInAutoComparison).toBe(true);
  });

  it('does NOT match iPhone 16 256 GB as an exact/high match (classifies as Benzer ürün)', () => {
    const res = compareProducts(refTitle, 'Apple iPhone 16 256 GB Black');
    expect(res.confidence).toBe('Benzer ürün');
    expect(res.includeInAutoComparison).toBe(false);
  });

  it('does NOT match iPhone 16 Pro 128 GB (classifies as Farklı ürün)', () => {
    const res = compareProducts(refTitle, 'Apple iPhone 16 Pro 128 GB Black');
    expect(res.confidence).toBe('Farklı ürün');
    expect(res.includeInAutoComparison).toBe(false);
  });

  it('does NOT match iPhone 15 128 GB (classifies as Farklı ürün)', () => {
    const res = compareProducts(refTitle, 'Apple iPhone 15 128 GB Black');
    expect(res.confidence).toBe('Farklı ürün');
    expect(res.includeInAutoComparison).toBe(false);
  });

  it('rejects phone cases/accessories when matching a main device', () => {
    const res = compareProducts(refTitle, 'Apple iPhone 16 128 GB Uyumlu Silikon Kılıf Siyah');
    expect(res.confidence).toBe('Farklı ürün');
    expect(res.includeInAutoComparison).toBe(false);
  });
});

describe('4. Price Data Validation & URL Normalization (Section 18 & 41)', () => {
  it('flags extreme parser anomalies (e.g. 10.000 TL -> 10 TL) as suspicious', () => {
    const check = validatePriceData({
      newPrice: 10,
      referencePrice: 10000,
      currency: 'TRY',
    });
    expect(check.isSuspicious).toBe(true);
    expect(check.reason).toContain('Şüpheli fiyat');
  });

  it('normalizes product URLs by stripping tracking parameters and rejecting unsafe URLs', () => {
    const norm = normalizeProductUrl(
      'https://www.trendyol.com/sony/wh-1000xm5-p-31245678?utm_source=google&gclid=abc123&boutiqueId=61'
    );
    expect(norm.isValid).toBe(true);
    expect(norm.normalizedUrl).toBe('https://www.trendyol.com/sony/wh-1000xm5-p-31245678');

    const invalidLocal = normalizeProductUrl('http://localhost:3000/admin');
    expect(invalidLocal.isValid).toBe(false);

    const invalidScheme = normalizeProductUrl('javascript:alert(1)');
    expect(invalidScheme.isValid).toBe(false);
  });
});

describe('5. SQLite Database, Notification Deduplication & Store Adapter Failure (Section 19, 39, 42)', () => {
  it('saves a product to SQLite and prevents duplicate notifications for the exact same price', async () => {
    const created = await createProductWithOffers({
      name: 'Test Kulaklık WH-1000XM5',
      brand: 'Sony',
      model: 'WH-1000XM5',
      productCode: 'XM5-TEST',
      ean: '4548736132580',
      image: '',
      originalUrl: 'https://www.trendyol.com/sony/wh-1000xm5-p-111',
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
          url: 'https://www.trendyol.com/sony/wh-1000xm5-p-111',
          seller: 'Trendyol',
          price: 9500,
          currency: 'TRY',
          availability: 'Stokta',
          matchConfidence: 'Kesin eşleşme',
          matchScore: 100,
          matchTitle: 'Test Kulaklık WH-1000XM5',
          priceStatus: 'verified',
        },
      ],
    });

    expect(created.id).toBeTruthy();
    expect(created.current_lowest_price).toBe(9500);

    const dedupKey = `${created.id}:trendyol:price_drop:9500`;
    const firstNotif = await insertNotificationRecord({
      productId: created.id,
      storeId: 'trendyol',
      storeName: 'Trendyol',
      type: 'price_drop',
      title: 'Fiyat Düştü!',
      message: '10.000 TL -> 9.500 TL',
      oldPrice: 10000,
      newPrice: 9500,
      dropAmount: 500,
      dropPercent: 5,
      productUrl: created.original_url,
      dedupKey,
    });
    expect(firstNotif).not.toBeNull();

    // Second check with the exact same price (9.500 TL) MUST NOT create a duplicate notification
    const duplicateNotif = await insertNotificationRecord({
      productId: created.id,
      storeId: 'trendyol',
      storeName: 'Trendyol',
      type: 'price_drop',
      title: 'Fiyat Düştü!',
      message: '10.000 TL -> 9.500 TL',
      oldPrice: 10000,
      newPrice: 9500,
      dropAmount: 500,
      dropPercent: 5,
      productUrl: created.original_url,
      dedupKey,
    });
    expect(duplicateNotif).toBeNull();

    // Further drop to 9.300 TL MUST create a new notification
    const lowerNotif = await insertNotificationRecord({
      productId: created.id,
      storeId: 'trendyol',
      storeName: 'Trendyol',
      type: 'price_drop',
      title: 'Fiyat Düştü!',
      message: '9.500 TL -> 9.300 TL',
      oldPrice: 9500,
      newPrice: 9300,
      dropAmount: 200,
      dropPercent: 2.1,
      productUrl: created.original_url,
      dedupKey: `${created.id}:trendyol:price_drop:9300`,
    });
    expect(lowerNotif).not.toBeNull();
  });

  it('extracts identity from URL slug and never fabricates a price when store is unreachable', async () => {
    const slugInfo = extractIdentityFromUrlSlug(
      'https://www.trendyol.com/apple/iphone-16-128-gb-siyah-p-85412369'
    );
    expect(slugInfo.brand).toBe('Apple');
    expect(slugInfo.sku).toBe('85412369');
    expect(extractProductSpecs(slugInfo.title).storage).toBe('128 GB');

    const adapter = new TrendyolAdapter();
    const failedCheck = await adapter.getProductDetails('https://invalid.domain.local/test');
    expect(failedCheck.price).toBeNull();
    expect(failedCheck.isVerifiedFromPage).toBe(false);
    expect(failedCheck.errorMessage).toBe('Bu mağazanın fiyatı şu anda kontrol edilemedi.');
  });
});
