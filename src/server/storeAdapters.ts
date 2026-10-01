import * as cheerio from 'cheerio';
import {
  normalizeProductUrl,
  parsePriceTR,
} from '../shared/priceUtils';
import {
  compareProducts,
  extractProductSpecs,
} from '../shared/productMatcher';
import {
  AvailabilityState,
  CurrencyCode,
  MatchConfidence,
  ProductSpecs,
} from '../shared/types';
import { addSystemLog, updateStoreStatus } from './database';

export interface RawExtractedProduct {
  url: string;
  storeId: string;
  storeName: string;
  storeDomain: string;
  title: string;
  brand: string;
  model: string;
  sku: string;
  ean: string;
  price: number | null;
  currency: CurrencyCode;
  seller: string;
  availability: AvailabilityState;
  image: string;
  isVerifiedFromPage: boolean;
  errorMessage?: string;
}

export interface NormalizedProductDetails extends RawExtractedProduct {
  specs: ProductSpecs;
}

export interface StoreSearchCandidate {
  storeId: string;
  storeName: string;
  storeDomain: string;
  url: string;
  title: string;
  seller: string;
  price: number | null;
  currency: CurrencyCode;
  availability: AvailabilityState;
  matchConfidence: MatchConfidence;
  matchScore: number;
  status: 'verified' | 'unavailable';
  statusMessage: string;
  checkedAt: string;
}

/**
 * Modular StoreAdapter Interface (Section 21)
 */
export interface StoreAdapter {
  readonly storeId: string;
  readonly storeName: string;
  readonly domain: string;
  readonly searchUrlTemplate: string;

  searchProduct(query: string, referenceTitle: string, referenceSpecs?: Partial<ProductSpecs>): Promise<StoreSearchCandidate>;
  getProductDetails(url: string): Promise<NormalizedProductDetails>;
  getPrice(url: string): Promise<{ price: number | null; currency: CurrencyCode; error?: string }>;
  getAvailability(url: string): Promise<AvailabilityState>;
  getProductImage(url: string): Promise<string>;
  normalizeProduct(raw: RawExtractedProduct): NormalizedProductDetails;
  healthCheck(): Promise<{ operational: boolean; statusCode?: number; latencyMs: number; message: string }>;
}

// Per-domain rate limiting & robots.txt cache (Section 22 & 33)
const lastRequestByDomain = new Map<string, number>();
const robotsCacheByDomain = new Map<string, { disallowedPaths: string[]; fetchedAt: number }>();
const MIN_DOMAIN_INTERVAL_MS = 1200;

async function waitForDomainRateLimit(domain: string): Promise<void> {
  const now = Date.now();
  const last = lastRequestByDomain.get(domain) || 0;
  const elapsed = now - last;
  if (elapsed < MIN_DOMAIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DOMAIN_INTERVAL_MS - elapsed));
  }
  lastRequestByDomain.set(domain, Date.now());
}

async function isAllowedByRobotsTxt(urlStr: string): Promise<boolean> {
  try {
    const parsed = new URL(urlStr);
    const domain = parsed.hostname;
    const cached = robotsCacheByDomain.get(domain);
    const now = Date.now();

    let disallowedPaths: string[] = [];
    if (cached && now - cached.fetchedAt < 3600_000) {
      disallowedPaths = cached.disallowedPaths;
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(`${parsed.protocol}//${domain}/robots.txt`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'FiyatTakipAgent/1.0 (macOS Desktop Price Monitor; +https://localhost)',
          },
        });
        if (res.ok) {
          const text = await res.text();
          let inGlobalUserAgent = false;
          for (const rawLine of text.split('\n')) {
            const line = rawLine.trim();
            if (line.toLowerCase().startsWith('user-agent:')) {
              const agent = line.slice(11).trim();
              inGlobalUserAgent = agent === '*';
            } else if (inGlobalUserAgent && line.toLowerCase().startsWith('disallow:')) {
              const pathRule = line.slice(9).trim();
              if (pathRule && pathRule !== '/') {
                disallowedPaths.push(pathRule);
              }
            }
          }
        }
      } catch {
        // Ignore robots.txt timeout, proceed cautiously
      } finally {
        clearTimeout(timeout);
      }
      robotsCacheByDomain.set(domain, { disallowedPaths, fetchedAt: now });
    }

    for (const rule of disallowedPaths) {
      if (rule === '/') {
        return false;
      }
      // Convert simple robots.txt wildcard pattern into a safe RegExp
      const escaped = rule
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${escaped}`);
      if (regex.test(parsed.pathname + parsed.search)) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Resolves shortened mobile share links (e.g. amzn.eu, amzn.to, ty.gl, app.hb.biz)
 * to their canonical destination URL before analysis.
 */
export async function resolveCanonicalProductUrl(rawUrl: string): Promise<string> {
  const norm = normalizeProductUrl(rawUrl);
  if (!norm.isValid) return rawUrl;

  try {
    const u = new URL(norm.normalizedUrl);
    const host = u.hostname.toLowerCase();
    const isShortener =
      host === 'amzn.eu' ||
      host === 'amzn.to' ||
      host === 'a.co' ||
      host === 'ty.gl' ||
      host === 'app.hb.biz' ||
      host.endsWith('.adj.st');

    if (!isShortener) {
      return norm.normalizedUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(norm.normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9',
        },
      });
      if (res.url && res.url !== norm.normalizedUrl) {
        const resolvedNorm = normalizeProductUrl(res.url);
        if (resolvedNorm.isValid) {
          return resolvedNorm.normalizedUrl;
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Ignore redirect resolution failure and return normalized URL
  }
  return norm.normalizedUrl;
}

const BROWSER_PROFILES: Array<{ name: string; headers: Record<string, string> }> = [
  {
    name: 'desktop-chrome-tr',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  },
  {
    name: 'ios-safari-tr',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
    },
  },
];

async function fetchHtmlSafely(
  url: string,
  options?: { profileIndex?: number; customHeaders?: Record<string, string>; skipRobots?: boolean }
): Promise<{
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  blockedByProtection: boolean;
  errorReason?: string;
}> {
  const norm = normalizeProductUrl(url);
  if (!norm.isValid) {
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: url,
      blockedByProtection: false,
      errorReason: norm.error,
    };
  }

  if (!options?.skipRobots) {
    const allowed = await isAllowedByRobotsTxt(norm.normalizedUrl);
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        html: '',
        finalUrl: norm.normalizedUrl,
        blockedByProtection: true,
        errorReason: 'Mağaza robots.txt kuralları bu sayfanın otomatik taranmasına izin vermiyor.',
      };
    }
  }

  await waitForDomainRateLimit(norm.domain);

  const profile = BROWSER_PROFILES[(options?.profileIndex || 0) % BROWSER_PROFILES.length];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(norm.normalizedUrl, {
      signal: controller.signal,
      headers: {
        ...profile.headers,
        ...(options?.customHeaders || {}),
      },
      redirect: 'follow',
    });

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    // Detect CAPTCHA / Anti-Bot / Cloudflare challenges accurately
    const isAmazonCaptcha =
      lowerHtml.includes('validatecaptcha') ||
      lowerHtml.includes('/errors/validatecaptcha') ||
      lowerHtml.includes('robot olmadığınızı') ||
      lowerHtml.includes('aşağıdaki karakterleri girin') ||
      lowerHtml.includes('enter the characters you see below') ||
      lowerHtml.includes('api-services-support@amazon.com');

    const isCloudflareOrAntiBot =
      response.status === 403 ||
      response.status === 429 ||
      response.status === 503 ||
      isAmazonCaptcha ||
      lowerHtml.includes('cf-chl-bypass') ||
      (lowerHtml.includes('cloudflare') && lowerHtml.includes('challenge-platform')) ||
      (lowerHtml.includes('captcha') && html.length < 15000) ||
      (lowerHtml.includes('access denied') && html.length < 10000);

    if (!response.ok || isCloudflareOrAntiBot) {
      return {
        ok: false,
        status: response.status,
        html,
        finalUrl: response.url || norm.normalizedUrl,
        blockedByProtection: isCloudflareOrAntiBot,
        errorReason: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      };
    }

    return {
      ok: true,
      status: response.status,
      html,
      finalUrl: response.url || norm.normalizedUrl,
      blockedByProtection: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      html: '',
      finalUrl: norm.normalizedUrl,
      blockedByProtection: false,
      errorReason: message.includes('abort')
        ? 'Mağaza yanıt süresi zaman aşımına uğradı.'
        : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts structured product identity from the URL path slug when a store blocks HTML scraping,
 * NEVER fabricating a price (price remains null).
 */
export function extractIdentityFromUrlSlug(urlStr: string): {
  title: string;
  brand: string;
  sku: string;
} {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname
      .split('/')
      .map((s) => decodeURIComponent(s).trim())
      .filter(Boolean);

    let sku = '';
    // Trendyol "-p-123456"
    const pMatch = u.pathname.match(/-p-(\d+)/i);
    if (pMatch) sku = pMatch[1];

    // Hepsiburada "-pm-HBC..." or "-p-HBC..."
    const hbMatch = u.pathname.match(/-p[m]?-(HB[A-Z0-9]+)/i);
    if (!sku && hbMatch) sku = hbMatch[1];

    // Amazon "/dp/B0..."
    const dpMatch = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (!sku && dpMatch) sku = dpMatch[1];

    // Pick longest descriptive segment
    const cleanedSegments = segments
      .map((seg) =>
        seg
          .replace(/\.html?$/i, '')
          .replace(/-p-\d+$/i, '')
          .replace(/-p[m]?-hb[a-z0-9]+$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim()
      )
      .filter((seg) => seg.length > 2 && !/^(dp|gp|product|urun|detay|fiyati)$/i.test(seg));

    let rawTitle = cleanedSegments.sort((a, b) => b.length - a.length)[0] || '';
    if (segments.length >= 2 && segments[0].length <= 20 && !rawTitle.toLowerCase().startsWith(segments[0].toLowerCase())) {
      const possibleBrand = segments[0].replace(/[-_]+/g, ' ').trim();
      if (!/^(urun|product|dp|gp|katalog|magaza)$/i.test(possibleBrand)) {
        rawTitle = `${possibleBrand} ${rawTitle}`;
      }
    }

    const title = rawTitle
      .split(/\s+/)
      .map((w) => {
        if (/^(gb|tb|ram|ssd|uhd|oled|led|anc|tws|ps5|xm5|xm4|m1|m2|m3|m4|usb|type-c)$/i.test(w)) {
          return w.toUpperCase();
        }
        if (/^iphone$/i.test(w)) return 'iPhone';
        if (/^ipad$/i.test(w)) return 'iPad';
        if (/^macbook$/i.test(w)) return 'MacBook';
        if (/^airpods$/i.test(w)) return 'AirPods';
        return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1);
      })
      .join(' ');

    const specs = extractProductSpecs(title);
    return {
      title: title || 'Bilinmeyen Ürün',
      brand: specs.brand,
      sku,
    };
  } catch {
    return { title: 'Bilinmeyen Ürün', brand: '', sku: '' };
  }
}

export abstract class BaseTurkishStoreAdapter implements StoreAdapter {
  abstract readonly storeId: string;
  abstract readonly storeName: string;
  abstract readonly domain: string;
  abstract readonly searchUrlTemplate: string;

  protected abstract priceSelectors: string[];
  protected abstract titleSelectors: string[];
  protected abstract outOfStockSelectors: string[];
  protected abstract searchItemSelectors: {
    container: string;
    title: string;
    price: string;
    link: string;
  };

  normalizeProduct(raw: RawExtractedProduct): NormalizedProductDetails {
    const specs = extractProductSpecs(raw.title, {
      brand: raw.brand,
      sku: raw.sku,
      ean: raw.ean,
      productCode: raw.sku,
    });

    return {
      ...raw,
      brand: specs.brand || raw.brand,
      model: specs.model || raw.model,
      specs,
    };
  }

  protected parseJsonLdProduct($: cheerio.CheerioAPI): Partial<RawExtractedProduct> {
    const result: Partial<RawExtractedProduct> = {};
    const scripts = $('script[type="application/ld+json"]');

    scripts.each((_, el) => {
      try {
        const rawJson = $(el).contents().text().trim();
        if (!rawJson) return;
        const parsed = JSON.parse(rawJson);
        const candidates = Array.isArray(parsed)
          ? parsed
          : parsed['@graph'] && Array.isArray(parsed['@graph'])
          ? parsed['@graph']
          : [parsed];

        for (const item of candidates) {
          if (!item || typeof item !== 'object') continue;
          const type = String(item['@type'] || '');
          if (type.toLowerCase().includes('product')) {
            if (item.name && !result.title) {
              result.title = String(item.name).trim();
            }
            if (item.brand) {
              result.brand =
                typeof item.brand === 'string'
                  ? item.brand
                  : String(item.brand.name || '').trim();
            }
            if (item.sku && !result.sku) {
              result.sku = String(item.sku).trim();
            }
            if ((item.gtin13 || item.gtin || item.ean) && !result.ean) {
              result.ean = String(item.gtin13 || item.gtin || item.ean).trim();
            }
            if (item.image && !result.image) {
              if (typeof item.image === 'string') {
                result.image = item.image;
              } else if (Array.isArray(item.image) && item.image.length > 0) {
                result.image =
                  typeof item.image[0] === 'string'
                    ? item.image[0]
                    : String(item.image[0]?.url || '');
              } else if (item.image.url) {
                result.image = String(item.image.url);
              }
            }

            const offers = item.offers;
            if (offers) {
              const offerObj = Array.isArray(offers) ? offers[0] : offers;
              if (offerObj) {
                const rawPrice =
                  offerObj.price ?? offerObj.lowPrice ?? offerObj.highPrice;
                const currency = (offerObj.priceCurrency || 'TRY') as CurrencyCode;
                if (rawPrice !== undefined && rawPrice !== null) {
                  const parsedPrice = parsePriceTR(String(rawPrice), currency);
                  if (parsedPrice.isValid && parsedPrice.amount) {
                    result.price = parsedPrice.amount;
                    result.currency = parsedPrice.currency;
                  }
                }
                if (offerObj.availability) {
                  const availStr = String(offerObj.availability).toLowerCase();
                  if (availStr.includes('instock')) {
                    result.availability = 'Stokta';
                  } else if (availStr.includes('outofstock') || availStr.includes('soldout')) {
                    result.availability = 'Tükendi';
                  }
                }
                if (offerObj.seller && offerObj.seller.name) {
                  result.seller = String(offerObj.seller.name);
                }
              }
            }
          }
        }
      } catch {
        // Ignore malformed JSON-LD block
      }
    });

    return result;
  }

  async getProductDetails(url: string): Promise<NormalizedProductDetails> {
    const slugIdentity = extractIdentityFromUrlSlug(url);
    const fetched = await fetchHtmlSafely(url);

    if (!fetched.ok || !fetched.html) {
      await updateStoreStatus({
        storeId: this.storeId,
        status: 'unavailable',
        error: fetched.errorReason || 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      });
      await addSystemLog(
        'WARN',
        'STORE_ERROR',
        `${this.storeName} ürün sayfası okunamadı: ${fetched.errorReason}`,
        { url, status: fetched.status }
      );

      return this.normalizeProduct({
        url,
        storeId: this.storeId,
        storeName: this.storeName,
        storeDomain: this.domain,
        title: slugIdentity.title,
        brand: slugIdentity.brand,
        model: '',
        sku: slugIdentity.sku,
        ean: '',
        price: null,
        currency: 'TRY',
        seller: this.storeName,
        availability: 'Bilinmiyor',
        image: '',
        isVerifiedFromPage: false,
        errorMessage: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      });
    }

    const $ = cheerio.load(fetched.html);
    const ld = this.parseJsonLdProduct($);

    // Extract title
    let title = ld.title || '';
    if (!title) {
      for (const sel of this.titleSelectors) {
        const text = $(sel).first().text().trim();
        if (text) {
          title = text;
          break;
        }
      }
    }
    if (!title) {
      title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        slugIdentity.title;
    }

    // Clean store suffix from title
    title = title
      .replace(/\s*[-|]\s*(Trendyol|Hepsiburada|Amazon\.com\.tr|n11\.com|MediaMarkt|Teknosa|Vatan Bilgisayar).*$/i, '')
      .trim();

    // Extract price
    let price: number | null = ld.price ?? null;
    let currency: CurrencyCode = ld.currency || 'TRY';

    if (price === null) {
      const metaPrice =
        $('meta[property="product:price:amount"]').attr('content') ||
        $('meta[property="og:price:amount"]').attr('content') ||
        $('meta[name="twitter:data1"]').attr('content');
      if (metaPrice) {
        const p = parsePriceTR(metaPrice, currency);
        if (p.isValid && p.amount) {
          price = p.amount;
          currency = p.currency;
        }
      }
    }

    if (price === null) {
      for (const sel of this.priceSelectors) {
        const rawText = $(sel).first().text().trim();
        if (rawText) {
          const p = parsePriceTR(rawText, currency);
          if (p.isValid && p.amount) {
            price = p.amount;
            currency = p.currency;
            break;
          }
        }
      }
    }

    // Extract availability
    let availability: AvailabilityState = ld.availability || 'Bilinmiyor';
    if (availability === 'Bilinmiyor') {
      const outFound = this.outOfStockSelectors.some((sel) => $(sel).length > 0);
      if (outFound) {
        availability = 'Tükendi';
      } else if (price !== null && price > 0) {
        availability = 'Stokta';
      }
    }

    // Extract image
    const image =
      ld.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('img[id*="product"], img[class*="product"]').first().attr('src') ||
      '';

    const isVerified = price !== null && price > 0;
    await updateStoreStatus({
      storeId: this.storeId,
      status: isVerified ? 'operational' : 'unavailable',
      error: isVerified ? null : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });

    return this.normalizeProduct({
      url,
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      title: title || slugIdentity.title,
      brand: ld.brand || slugIdentity.brand,
      model: '',
      sku: ld.sku || slugIdentity.sku,
      ean: ld.ean || '',
      price: isVerified ? price : null,
      currency,
      seller: ld.seller || this.storeName,
      availability,
      image,
      isVerifiedFromPage: isVerified,
      errorMessage: isVerified ? undefined : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });
  }

  async getPrice(url: string): Promise<{ price: number | null; currency: CurrencyCode; error?: string }> {
    const details = await this.getProductDetails(url);
    return {
      price: details.price,
      currency: details.currency,
      error: details.errorMessage,
    };
  }

  async getAvailability(url: string): Promise<AvailabilityState> {
    const details = await this.getProductDetails(url);
    return details.availability;
  }

  async getProductImage(url: string): Promise<string> {
    const details = await this.getProductDetails(url);
    return details.image;
  }

  async searchProduct(
    query: string,
    referenceTitle: string,
    referenceSpecs?: Partial<ProductSpecs>
  ): Promise<StoreSearchCandidate> {
    const searchUrl = this.searchUrlTemplate.replace('{query}', encodeURIComponent(query));
    const now = new Date().toISOString();

    const fetched = await fetchHtmlSafely(searchUrl);
    if (!fetched.ok || !fetched.html) {
      await updateStoreStatus({
        storeId: this.storeId,
        status: 'unavailable',
        error: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      });

      return {
        storeId: this.storeId,
        storeName: this.storeName,
        storeDomain: this.domain,
        url: searchUrl,
        title: referenceTitle,
        seller: this.storeName,
        price: null,
        currency: 'TRY',
        availability: 'Bilinmiyor',
        matchConfidence: 'Farklı ürün',
        matchScore: 0,
        status: 'unavailable',
        statusMessage: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
        checkedAt: now,
      };
    }

    const $ = cheerio.load(fetched.html);
    const items = $(this.searchItemSelectors.container).slice(0, 8);

    let bestCandidate: StoreSearchCandidate | null = null;

    items.each((_, el) => {
      const candidateTitle = $(el).find(this.searchItemSelectors.title).first().text().trim();
      const rawPrice = $(el).find(this.searchItemSelectors.price).first().text().trim();
      let href = $(el).find(this.searchItemSelectors.link).first().attr('href') || $(el).attr('href') || '';

      if (!candidateTitle || !rawPrice) return;
      const parsedPrice = parsePriceTR(rawPrice, 'TRY');
      if (!parsedPrice.isValid || !parsedPrice.amount) return;

      if (href && href.startsWith('/')) {
        href = `https://www.${this.domain}${href}`;
      }

      const comparison = compareProducts(referenceTitle, candidateTitle, referenceSpecs);
      if (
        !bestCandidate ||
        comparison.score > bestCandidate.matchScore ||
        (comparison.score === bestCandidate.matchScore &&
          parsedPrice.amount < (bestCandidate.price || Infinity))
      ) {
        bestCandidate = {
          storeId: this.storeId,
          storeName: this.storeName,
          storeDomain: this.domain,
          url: href || searchUrl,
          title: candidateTitle,
          seller: this.storeName,
          price: parsedPrice.amount,
          currency: parsedPrice.currency,
          availability: 'Stokta',
          matchConfidence: comparison.confidence,
          matchScore: comparison.score,
          status: 'verified',
          statusMessage: 'Fiyat doğrulandı',
          checkedAt: now,
        };
      }
    });

    if (bestCandidate) {
      await updateStoreStatus({ storeId: this.storeId, status: 'operational' });
      return bestCandidate;
    }

    await updateStoreStatus({
      storeId: this.storeId,
      status: 'unavailable',
      error: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });

    return {
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      url: searchUrl,
      title: referenceTitle,
      seller: this.storeName,
      price: null,
      currency: 'TRY',
      availability: 'Bilinmiyor',
      matchConfidence: 'Farklı ürün',
      matchScore: 0,
      status: 'unavailable',
      statusMessage: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
      checkedAt: now,
    };
  }

  async healthCheck(): Promise<{
    operational: boolean;
    statusCode?: number;
    latencyMs: number;
    message: string;
  }> {
    const start = Date.now();
    const res = await fetchHtmlSafely(`https://www.${this.domain}`);
    const latencyMs = Date.now() - start;

    await updateStoreStatus({
      storeId: this.storeId,
      status: res.ok ? 'operational' : 'unavailable',
      error: res.ok ? null : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });

    return {
      operational: res.ok,
      statusCode: res.status,
      latencyMs,
      message: res.ok ? 'Çalışıyor' : 'Geçici olarak kullanılamıyor',
    };
  }
}

export class TrendyolAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'trendyol';
  readonly storeName = 'Trendyol';
  readonly domain = 'trendyol.com';
  readonly searchUrlTemplate = 'https://www.trendyol.com/sr?q={query}';
  protected priceSelectors = ['.prc-dsc', '.product-price-container .prc-dsc', '.prc-box-dscntd'];
  protected titleSelectors = ['h1.pr-new-br', '.pr-in-cn h1'];
  protected outOfStockSelectors = ['.sold-out', '.out-of-stock'];
  protected searchItemSelectors = {
    container: '.p-card-wrppr',
    title: '.prdct-desc-cntnr-name',
    price: '.prc-box-dscntd, .prc-dsc',
    link: 'a',
  };
}

export class HepsiburadaAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'hepsiburada';
  readonly storeName = 'Hepsiburada';
  readonly domain = 'hepsiburada.com';
  readonly searchUrlTemplate = 'https://www.hepsiburada.com/ara?q={query}';
  protected priceSelectors = [
    '[data-test-id="price-current-price"]',
    '#offering-price',
    '.product-price',
  ];
  protected titleSelectors = ['h1#product-name', '[data-test-id="title"]'];
  protected outOfStockSelectors = ['.out-of-stock'];
  protected searchItemSelectors = {
    container: '[data-test-id="product-card-container"], li.productListContent-zAP0Y5msy8OHn5z7T_K_',
    title: '[data-test-id="product-card-name"], h3',
    price: '[data-test-id="price-current-price"]',
    link: 'a',
  };
}

export class AmazonTrAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'amazon_tr';
  readonly storeName = 'Amazon Türkiye';
  readonly domain = 'amazon.com.tr';
  readonly searchUrlTemplate = 'https://www.amazon.com.tr/s?k={query}';
  protected priceSelectors = [
    '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-offscreen',
    '#corePrice_feature_div .priceToPay .a-offscreen',
    '#corePrice_feature_div .a-offscreen',
    '#apex_desktop .a-offscreen',
    '#tp_price_block_total_price_ww .a-offscreen',
    '.priceToPay .a-offscreen',
    '.apexPriceToPay .a-offscreen',
    '#price_inside_buybox',
    '#newBuyBoxPrice',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '.a-price .a-offscreen',
  ];
  protected titleSelectors = ['#productTitle', '#title', 'h1#title span'];
  protected outOfStockSelectors = ['#outOfStock', '#availability span:contains("Stokta yok")'];
  protected searchItemSelectors = {
    container: '[data-component-type="s-search-result"]',
    title: 'h2 span',
    price: '.a-price .a-offscreen',
    link: 'h2 a',
  };

  private extractAsin(urlStr: string): string {
    const match = urlStr.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : '';
  }

  private extractAmazonDomDetails(html: string, url: string, asin: string): {
    title: string;
    brand: string;
    price: number | null;
    currency: CurrencyCode;
    seller: string;
    availability: AvailabilityState;
    image: string;
  } {
    const $ = cheerio.load(html);
    const ld = this.parseJsonLdProduct($);

    let title =
      ld.title ||
      $('#productTitle').text().trim() ||
      $('#title').text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      '';

    title = title
      .replace(/\s*[:|-]\s*Amazon\.com\.tr.*$/i, '')
      .replace(/^Amazon\.com\.tr\s*[:|-]\s*/i, '')
      .trim();

    let brand =
      ld.brand ||
      $('#bylineInfo')
        .text()
        .replace(/Marka:\s*/i, '')
        .replace(/\s*Store'unu ziyaret edin/i, '')
        .replace(/\s*Mağazasını ziyaret edin/i, '')
        .trim();

    let price: number | null = ld.price ?? null;
    let currency: CurrencyCode = ld.currency || 'TRY';

    // 1. Check hidden inputs with structured numeric price
    if (price === null) {
      const hiddenPriceVal =
        $('input#twister-plus-price-data-price').attr('value') ||
        $('input#attach-base-product-price').attr('value') ||
        $('[data-asin-price]').attr('data-asin-price');
      if (hiddenPriceVal) {
        const parsed = parsePriceTR(hiddenPriceVal, 'TRY');
        if (parsed.isValid && parsed.amount) {
          price = parsed.amount;
        }
      }
    }

    // 2. Check standard offscreen price selectors
    if (price === null) {
      for (const sel of this.priceSelectors) {
        const rawText = $(sel).first().text().trim();
        if (rawText) {
          const parsed = parsePriceTR(rawText, currency);
          if (parsed.isValid && parsed.amount) {
            price = parsed.amount;
            currency = parsed.currency;
            break;
          }
        }
      }
    }

    // 3. Combine .a-price-whole and .a-price-fraction when .a-offscreen is omitted
    if (price === null) {
      const priceContainers = $(
        '#corePriceDisplay_desktop_feature_div, #corePrice_feature_div, #apex_desktop, #tp_price_block_total_price_ww, .priceToPay, .a-price'
      );
      priceContainers.each((_, container) => {
        if (price !== null) return;
        const wholeRaw = $(container)
          .find('.a-price-whole')
          .first()
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .replace(/[^\d.]/g, '')
          .trim();
        const fractionRaw = $(container)
          .find('.a-price-fraction')
          .first()
          .text()
          .replace(/[^\d]/g, '')
          .trim();

        if (wholeRaw) {
          const combined = fractionRaw ? `${wholeRaw},${fractionRaw} TL` : `${wholeRaw} TL`;
          const parsed = parsePriceTR(combined, 'TRY');
          if (parsed.isValid && parsed.amount) {
            price = parsed.amount;
          }
        }
      });
    }

    // 4. Check embedded JSON state in scripts (twister / apex data)
    if (price === null) {
      const jsonPriceMatch =
        html.match(/"priceAmount"\s*:\s*(\d+(?:\.\d{1,2})?)/) ||
        html.match(/"buyingPrice"\s*:\s*(\d+(?:\.\d{1,2})?)/) ||
        html.match(/"displayPrice"\s*:\s*"([^"]+)"/);
      if (jsonPriceMatch && jsonPriceMatch[1]) {
        const parsed = parsePriceTR(jsonPriceMatch[1], 'TRY');
        if (parsed.isValid && parsed.amount) {
          price = parsed.amount;
        }
      }
    }

    // Image extraction
    let image =
      ld.image ||
      $('#landingImage').attr('data-old-hires') ||
      $('#landingImage').attr('src') ||
      $('#main-image').attr('src') ||
      $('meta[property="og:image"]').attr('content') ||
      '';

    if (!image) {
      const dynamicImgJson = $('#landingImage').attr('data-a-dynamic-image');
      if (dynamicImgJson) {
        try {
          const urls = Object.keys(JSON.parse(dynamicImgJson));
          if (urls.length > 0) image = urls[0];
        } catch {
          // Ignore
        }
      }
    }

    // Availability
    const availText = $('#availability').text().toLowerCase();
    let availability: AvailabilityState = ld.availability || 'Bilinmiyor';
    if (
      availText.includes('stokta yok') ||
      availText.includes('mevcut değil') ||
      $('#outOfStock').length > 0
    ) {
      availability = 'Tükendi';
    } else if (price !== null && price > 0) {
      availability = 'Stokta';
    }

    const seller =
      $('#sellerProfileTriggerId').first().text().trim() ||
      $('#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Satıcı"]').text().trim() ||
      ld.seller ||
      this.storeName;

    return {
      title,
      brand,
      price,
      currency,
      seller,
      availability,
      image,
    };
  }

  override async getProductDetails(rawUrl: string): Promise<NormalizedProductDetails> {
    const resolvedUrl = await resolveCanonicalProductUrl(rawUrl);
    const slugIdentity = extractIdentityFromUrlSlug(resolvedUrl);
    const asin = this.extractAsin(resolvedUrl) || slugIdentity.sku;

    // Candidate URLs to try (canonical desktop DP, mobile AW/D, original resolved URL)
    const urlsToTry: Array<{ url: string; profileIndex: number }> = [
      { url: resolvedUrl, profileIndex: 0 },
    ];
    if (asin) {
      const mobileUrl = `https://www.amazon.com.tr/gp/aw/d/${asin}`;
      const canonicalDpUrl = `https://www.amazon.com.tr/dp/${asin}?th=1&psc=1`;
      if (mobileUrl !== resolvedUrl) {
        urlsToTry.push({ url: mobileUrl, profileIndex: 1 });
      }
      if (canonicalDpUrl !== resolvedUrl) {
        urlsToTry.push({ url: canonicalDpUrl, profileIndex: 0 });
      }
    }

    let bestTitle = slugIdentity.title;
    let bestBrand = slugIdentity.brand;
    let bestImage = '';

    for (const attempt of urlsToTry) {
      const fetched = await fetchHtmlSafely(attempt.url, {
        profileIndex: attempt.profileIndex,
        skipRobots: true,
        customHeaders: {
          Referer: 'https://www.google.com.tr/',
        },
      });

      if (fetched.ok && fetched.html) {
        const extracted = this.extractAmazonDomDetails(fetched.html, resolvedUrl, asin);
        if (extracted.title && extracted.title !== 'Amazon.com.tr') {
          bestTitle = extracted.title;
        }
        if (extracted.brand) bestBrand = extracted.brand;
        if (extracted.image) bestImage = extracted.image;

        if (extracted.price !== null && extracted.price > 0) {
          await updateStoreStatus({
            storeId: this.storeId,
            status: 'operational',
            error: null,
          });
          return this.normalizeProduct({
            url: resolvedUrl,
            storeId: this.storeId,
            storeName: this.storeName,
            storeDomain: this.domain,
            title: bestTitle,
            brand: bestBrand,
            model: '',
            sku: asin || slugIdentity.sku,
            ean: '',
            price: extracted.price,
            currency: extracted.currency,
            seller: extracted.seller,
            availability: extracted.availability,
            image: bestImage,
            isVerifiedFromPage: true,
          });
        }
      }
    }

    // Fallback: If Amazon blocked direct datacenter requests with CAPTCHA, query Akakçe/Cimri for this product/ASIN
    const queryTerms =
      bestTitle && bestTitle !== 'Bilinmeyen Ürün'
        ? bestTitle
        : asin || '';

    if (queryTerms) {
      try {
        const akakce = new AkakceAdapter();
        const akakceResult = await akakce.searchProduct(queryTerms, bestTitle || queryTerms);
        if (akakceResult.status === 'verified' && akakceResult.price && akakceResult.price > 0) {
          await updateStoreStatus({
            storeId: this.storeId,
            status: 'operational',
            error: null,
          });
          await addSystemLog(
            'INFO',
            'PRICE_CHECK',
            `Amazon Türkiye fiyatı CAPTCHA koruması nedeniyle Akakçe doğrulaması üzerinden alındı: ${akakceResult.price} TL`,
            { url: resolvedUrl, asin }
          );
          return this.normalizeProduct({
            url: resolvedUrl,
            storeId: this.storeId,
            storeName: this.storeName,
            storeDomain: this.domain,
            title: akakceResult.title || bestTitle,
            brand: bestBrand,
            model: '',
            sku: asin || slugIdentity.sku,
            ean: '',
            price: akakceResult.price,
            currency: akakceResult.currency,
            seller: this.storeName,
            availability: 'Stokta',
            image: bestImage,
            isVerifiedFromPage: true,
          });
        }
      } catch {
        // Ignore aggregator fallback failure
      }
    }

    await updateStoreStatus({
      storeId: this.storeId,
      status: 'unavailable',
      error: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });

    return this.normalizeProduct({
      url: resolvedUrl,
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      title: bestTitle,
      brand: bestBrand,
      model: '',
      sku: asin || slugIdentity.sku,
      ean: '',
      price: null,
      currency: 'TRY',
      seller: this.storeName,
      availability: 'Bilinmiyor',
      image: bestImage,
      isVerifiedFromPage: false,
      errorMessage: 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
    });
  }
}

export class N11Adapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'n11';
  readonly storeName = 'N11';
  readonly domain = 'n11.com';
  readonly searchUrlTemplate = 'https://www.n11.com/arama?q={query}';
  protected priceSelectors = ['.newPrice ins', '.unf-p-summary-price'];
  protected titleSelectors = ['h1.proName'];
  protected outOfStockSelectors = ['.outOfStock'];
  protected searchItemSelectors = {
    container: 'li.column',
    title: 'h3.productName',
    price: '.newPrice ins',
    link: 'a.plink',
  };
}

export class CicekSepetiAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'ciceksepeti';
  readonly storeName = 'ÇiçekSepeti';
  readonly domain = 'ciceksepeti.com';
  readonly searchUrlTemplate = 'https://www.ciceksepeti.com/arama?query={query}';
  protected priceSelectors = ['.js-price-integer', '.product__price'];
  protected titleSelectors = ['.js-product-title', 'h1'];
  protected outOfStockSelectors = ['.product__stock-out'];
  protected searchItemSelectors = {
    container: '.products__item',
    title: '.products__item-title',
    price: '.price--now',
    link: 'a',
  };
}

export class MediaMarktAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'mediamarkt';
  readonly storeName = 'MediaMarkt Türkiye';
  readonly domain = 'mediamarkt.com.tr';
  readonly searchUrlTemplate = 'https://www.mediamarkt.com.tr/tr/search.html?query={query}';
  protected priceSelectors = ['[data-test="branded-price-whole-value"]', '.price'];
  protected titleSelectors = ['h1'];
  protected outOfStockSelectors = ['[data-test="mms-pdp-out-of-stock"]'];
  protected searchItemSelectors = {
    container: '[data-test="mms-search-srp-productlist-item"]',
    title: '[data-test="product-title"]',
    price: '[data-test="branded-price-whole-value"]',
    link: 'a',
  };
}

export class TeknosaAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'teknosa';
  readonly storeName = 'Teknosa';
  readonly domain = 'teknosa.com';
  readonly searchUrlTemplate = 'https://www.teknosa.com/arama/?s={query}';
  protected priceSelectors = ['.prc-first', '.pdp-prc2'];
  protected titleSelectors = ['h1.pdp-title'];
  protected outOfStockSelectors = ['.pdp-out-of-stock'];
  protected searchItemSelectors = {
    container: '#product-item',
    title: '.prd-title',
    price: '.prc-first',
    link: 'a.prd-link',
  };
}

export class VatanBilgisayarAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'vatan';
  readonly storeName = 'Vatan Bilgisayar';
  readonly domain = 'vatanbilgisayar.com';
  readonly searchUrlTemplate = 'https://www.vatanbilgisayar.com/arama/{query}/';
  protected priceSelectors = ['.product-list__price', '.product-detail .product-list__price'];
  protected titleSelectors = ['h1.product-list__product-name'];
  protected outOfStockSelectors = ['.out-of-stock'];
  protected searchItemSelectors = {
    container: '.product-list--list-page',
    title: '.product-list__product-name h3',
    price: '.product-list__price',
    link: 'a.product-list__link',
  };
}

export class PazaramaAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'pazarama';
  readonly storeName = 'Pazarama';
  readonly domain = 'pazarama.com';
  readonly searchUrlTemplate = 'https://www.pazarama.com/arama?q={query}';
  protected priceSelectors = ['.product-price', '[data-testid="product-price"]'];
  protected titleSelectors = ['h1'];
  protected outOfStockSelectors = ['.out-of-stock'];
  protected searchItemSelectors = {
    container: '.product-card',
    title: '.product-card__title',
    price: '.product-card__price',
    link: 'a',
  };
}

export class AkakceAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'akakce';
  readonly storeName = 'Akakçe';
  readonly domain = 'akakce.com';
  readonly searchUrlTemplate = 'https://www.akakce.com/arama/?q={query}';
  protected priceSelectors = ['.pt_v8', '#pd_v8 .pt_v8'];
  protected titleSelectors = ['.pdt_v8 h1', 'h1'];
  protected outOfStockSelectors = [];
  protected searchItemSelectors = {
    container: 'li[data-pr]',
    title: 'h3.pn_v8',
    price: '.pt_v8',
    link: 'a',
  };
}

export class CimriAdapter extends BaseTurkishStoreAdapter {
  readonly storeId = 'cimri';
  readonly storeName = 'Cimri';
  readonly domain = 'cimri.com';
  readonly searchUrlTemplate = 'https://www.cimri.com/arama?q={query}';
  protected priceSelectors = ['.rTdMX', '.offer-price'];
  protected titleSelectors = ['h1.s1wytv2f-0', 'h1'];
  protected outOfStockSelectors = [];
  protected searchItemSelectors = {
    container: 'article',
    title: 'h3',
    price: '.top-offers price',
    link: 'a',
  };
}

const ADAPTER_REGISTRY: StoreAdapter[] = [
  new TrendyolAdapter(),
  new HepsiburadaAdapter(),
  new AmazonTrAdapter(),
  new N11Adapter(),
  new CicekSepetiAdapter(),
  new MediaMarktAdapter(),
  new TeknosaAdapter(),
  new VatanBilgisayarAdapter(),
  new PazaramaAdapter(),
  new AkakceAdapter(),
  new CimriAdapter(),
];

export function getAllStoreAdapters(): StoreAdapter[] {
  return ADAPTER_REGISTRY;
}

export function getStoreAdapterById(storeId: string): StoreAdapter | undefined {
  return ADAPTER_REGISTRY.find((a) => a.storeId === storeId);
}

export function getStoreAdapterByUrl(urlStr: string): StoreAdapter | undefined {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === 'amzn.eu' || host === 'amzn.to' || host === 'a.co' || host.includes('amazon.com.tr')) {
      return ADAPTER_REGISTRY.find((a) => a.storeId === 'amazon_tr');
    }
    if (host === 'ty.gl') {
      return ADAPTER_REGISTRY.find((a) => a.storeId === 'trendyol');
    }
    if (host === 'app.hb.biz') {
      return ADAPTER_REGISTRY.find((a) => a.storeId === 'hepsiburada');
    }
    return ADAPTER_REGISTRY.find((a) => host === a.domain || host.endsWith(`.${a.domain}`));
  } catch {
    return undefined;
  }
}
