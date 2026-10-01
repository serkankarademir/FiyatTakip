import { CurrencyCode } from './types';

export interface ParsedPriceResult {
  amount: number | null;
  currency: CurrencyCode;
  raw: string;
  isValid: boolean;
}

export interface PriceChangeMetrics {
  diffAmount: number;
  diffPercent: number;
  isDecrease: boolean;
  isIncrease: boolean;
  isUnchanged: boolean;
  formattedDiffAmount: string;
  formattedDiffPercent: string;
}

export interface PriceValidationResult {
  isValid: boolean;
  isSuspicious: boolean;
  reason?: string;
}

/**
 * Parses Turkish and international price strings accurately.
 * Examples handled correctly:
 * - "9.249,00 TL" -> 9249
 * - "9.249 TL"    -> 9249 (NEVER 9.249)
 * - "9249 TL"     -> 9249
 * - "9.249,99₺"   -> 9249.99
 * - "104.999,50 TL" -> 104999.5
 * - "1.250.000 TL"  -> 1250000
 * - "49,90 TL"      -> 49.9
 */
export function parsePriceTR(input: string | number | null | undefined, defaultCurrency: CurrencyCode = 'TRY'): ParsedPriceResult {
  if (input === null || input === undefined) {
    return { amount: null, currency: defaultCurrency, raw: '', isValid: false };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      return { amount: null, currency: defaultCurrency, raw: String(input), isValid: false };
    }
    return { amount: Math.round(input * 100) / 100, currency: defaultCurrency, raw: String(input), isValid: true };
  }

  const raw = String(input).trim();
  if (!raw) {
    return { amount: null, currency: defaultCurrency, raw, isValid: false };
  }

  const currency = detectCurrency(raw, defaultCurrency);

  // Extract numeric token containing digits, dots, and commas
  const match = raw.match(/(\d[\d.,\s]*\d|\d)/);
  if (!match) {
    return { amount: null, currency, raw, isValid: false };
  }

  const token = match[1].replace(/\s+/g, '');

  let normalizedNumberStr = token;

  const hasDot = token.includes('.');
  const hasComma = token.includes(',');

  if (hasDot && hasComma) {
    const lastDotIdx = token.lastIndexOf('.');
    const lastCommaIdx = token.lastIndexOf(',');

    if (lastCommaIdx > lastDotIdx) {
      // Turkish/European format: "9.249,99" or "1.250.000,50" -> dot is thousands, comma is decimal
      normalizedNumberStr = token.replace(/\./g, '').replace(',', '.');
    } else {
      // US/UK format: "9,249.99" -> comma is thousands, dot is decimal
      normalizedNumberStr = token.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Only comma present: e.g., "9249,99" or "49,90" -> comma is decimal separator in TR
    // Unless there are multiple commas or exactly 3 digits after comma in USD/GBP context
    const parts = token.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalizedNumberStr = token.replace(',', '.');
    } else if (parts.length === 2 && parts[1].length === 3 && (currency === 'USD' || currency === 'GBP')) {
      normalizedNumberStr = token.replace(/,/g, '');
    } else if (parts.length > 2) {
      normalizedNumberStr = token.replace(/,/g, '');
    } else {
      normalizedNumberStr = token.replace(',', '.');
    }
  } else if (hasDot && !hasComma) {
    // Only dot(s) present: e.g., "9.249" or "1.250.000" or JSON-LD "9249.99"
    const parts = token.split('.');
    if (parts.length > 2) {
      // Multiple dots: definitely thousands separators ("1.250.000")
      normalizedNumberStr = token.replace(/\./g, '');
    } else if (parts.length === 2) {
      const fractionalLen = parts[1].length;
      if (fractionalLen === 3) {
        // In Turkish e-commerce, a single dot followed by 3 digits ("9.249 TL", "10.499 TL") is ALWAYS a thousands separator!
        normalizedNumberStr = token.replace(/\./g, '');
      } else {
        // 1 or 2 digits after dot (e.g. from JSON-LD "9249.99" or "9249.5") -> decimal point
        normalizedNumberStr = token;
      }
    }
  }

  const parsed = Number(normalizedNumberStr);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { amount: null, currency, raw, isValid: false };
  }

  const rounded = Math.round(parsed * 100) / 100;
  return {
    amount: rounded,
    currency,
    raw,
    isValid: true,
  };
}

/**
 * Detects currency code from string representation.
 */
export function detectCurrency(input: string, fallback: CurrencyCode = 'TRY'): CurrencyCode {
  const upper = input.toUpperCase();
  if (upper.includes('₺') || upper.includes('TL') || upper.includes('TRY')) {
    return 'TRY';
  }
  if (upper.includes('$') || upper.includes('USD')) {
    return 'USD';
  }
  if (upper.includes('€') || upper.includes('EUR')) {
    return 'EUR';
  }
  if (upper.includes('£') || upper.includes('GBP')) {
    return 'GBP';
  }
  return fallback;
}

/**
 * Formats a numeric price using Turkish locale conventions.
 * Example: 9249 -> "9.249,00 TL" (when forceDecimals = true) or "9.249 TL"
 */
export function formatPriceTR(
  amount: number | null | undefined,
  currency: CurrencyCode = 'TRY',
  forceDecimals: boolean = true
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }

  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const minFractionDigits = forceDecimals || hasCents ? 2 : 0;
  const maxFractionDigits = 2;

  const formattedNum = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(amount);

  switch (currency) {
    case 'TRY':
      return `${formattedNum} TL`;
    case 'USD':
      return `${formattedNum} $`;
    case 'EUR':
      return `${formattedNum} €`;
    case 'GBP':
      return `${formattedNum} £`;
    default:
      return `${formattedNum} TL`;
  }
}

/**
 * Calculates price change amount and percentage between previousPrice and currentPrice.
 */
export function calculatePriceChange(
  previousPrice: number | null | undefined,
  currentPrice: number | null | undefined,
  currency: CurrencyCode = 'TRY'
): PriceChangeMetrics | null {
  if (
    previousPrice === null ||
    previousPrice === undefined ||
    currentPrice === null ||
    currentPrice === undefined ||
    previousPrice <= 0 ||
    currentPrice <= 0
  ) {
    return null;
  }

  const diffAmount = Math.round((currentPrice - previousPrice) * 100) / 100;
  const diffPercent = Math.round(((currentPrice - previousPrice) / previousPrice) * 10000) / 100;

  const isDecrease = diffAmount < -0.001;
  const isIncrease = diffAmount > 0.001;
  const isUnchanged = !isDecrease && !isIncrease;

  const sign = isIncrease ? '+' : isDecrease ? '-' : '';
  const absAmountFormatted = formatPriceTR(Math.abs(diffAmount), currency, false);
  const absPercentFormatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: Math.abs(diffPercent) % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(diffPercent));

  return {
    diffAmount,
    diffPercent,
    isDecrease,
    isIncrease,
    isUnchanged,
    formattedDiffAmount: isUnchanged ? '0 TL' : `${sign}${absAmountFormatted}`,
    formattedDiffPercent: isUnchanged ? '%0' : `${sign}%${absPercentFormatted}`,
  };
}

/**
 * Evaluates whether the current price has reached or fallen below the target price.
 */
export function isTargetPriceReached(
  currentPrice: number | null | undefined,
  targetPrice: number | null | undefined
): boolean {
  if (
    currentPrice === null ||
    currentPrice === undefined ||
    targetPrice === null ||
    targetPrice === undefined ||
    currentPrice <= 0 ||
    targetPrice <= 0
  ) {
    return false;
  }
  return currentPrice <= targetPrice;
}

/**
 * Evaluates whether a price decrease satisfies the user's configured notification rules.
 */
export function shouldTriggerPriceDropNotification(params: {
  oldPrice: number;
  newPrice: number;
  ruleType: 'any' | 'percent' | 'amount' | 'both';
  minDropPercent: number;
  minDropAmount: number;
}): boolean {
  const { oldPrice, newPrice, ruleType, minDropPercent, minDropAmount } = params;
  if (oldPrice <= 0 || newPrice <= 0 || newPrice >= oldPrice) {
    return false;
  }

  const dropAmount = oldPrice - newPrice;
  const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;

  switch (ruleType) {
    case 'any':
      return dropAmount > 0;
    case 'percent':
      return dropPercent >= minDropPercent;
    case 'amount':
      return dropAmount >= minDropAmount;
    case 'both':
      return dropPercent >= minDropPercent && dropAmount >= minDropAmount;
    default:
      return dropAmount > 0;
  }
}

/**
 * Validates price data before recording to database.
 * Rejects invalid prices and flags suspicious parser anomalies (e.g. 10.000 TL -> 10 TL).
 */
export function validatePriceData(params: {
  newPrice: number | null | undefined;
  referencePrice?: number | null;
  currency?: string;
  isProductPage?: boolean;
  isBundleMismatch?: boolean;
}): PriceValidationResult {
  const {
    newPrice,
    referencePrice,
    currency = 'TRY',
    isProductPage = true,
    isBundleMismatch = false,
  } = params;

  if (newPrice === null || newPrice === undefined || typeof newPrice !== 'number' || !Number.isFinite(newPrice)) {
    return { isValid: false, isSuspicious: false, reason: 'Geçersiz sayısal fiyat değeri.' };
  }

  if (newPrice <= 0) {
    return { isValid: false, isSuspicious: false, reason: 'Fiyat sıfır veya negatif olamaz.' };
  }

  if (!['TRY', 'USD', 'EUR', 'GBP'].includes(currency)) {
    return { isValid: false, isSuspicious: false, reason: 'Bilinmeyen para birimi.' };
  }

  if (!isProductPage) {
    return { isValid: false, isSuspicious: false, reason: 'Sayfa geçerli bir ürün sayfası olarak doğrulanamadı.' };
  }

  if (isBundleMismatch) {
    return { isValid: false, isSuspicious: true, reason: 'Paket veya aksesuar uyuşmazlığı tespit edildi.' };
  }

  // Check for extreme anomaly when a reference price exists (e.g., 10.000 TL -> 10 TL)
  if (referencePrice && referencePrice > 100) {
    const ratio = newPrice / referencePrice;
    if (ratio < 0.22) {
      return {
        isValid: true,
        isSuspicious: true,
        reason: `Şüpheli fiyat: Önceki fiyat (${formatPriceTR(referencePrice, currency as CurrencyCode)}) ile yeni algılanan fiyat (${formatPriceTR(newPrice, currency as CurrencyCode)}) arasında olağandışı fark (%${Math.round((1 - ratio) * 100)} düşüş) var. Doğrulama gerekiyor.`,
      };
    }
    if (ratio > 6) {
      return {
        isValid: true,
        isSuspicious: true,
        reason: `Şüpheli fiyat: Yeni algılanan fiyat önceki fiyatın 6 katından fazla.`,
      };
    }
  }

  return { isValid: true, isSuspicious: false };
}

/**
 * Validates and normalizes product URLs, removing tracking query parameters
 * while preserving essential product identifiers.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'yclid',
  'msclkid',
  'twclid',
  'ttclid',
  'ref',
  'ref_',
  'tag',
  'linkCode',
  'camp',
  'creative',
  'aff_id',
  'affiliate',
  'adjust_t',
  'adjust_campaign',
  'adjust_adgroup',
  'adjust_creative',
  'boutiqueId',
  'merchantId',
  'v',
  'spm',
  'scm',
]);

export function normalizeProductUrl(rawUrl: string): {
  isValid: boolean;
  normalizedUrl: string;
  domain: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, normalizedUrl: '', domain: '', error: 'Lütfen geçerli bir ürün bağlantısı girin.' };
  }

  let trimmed = rawUrl.trim();
  // Support iPhone/Android share sheet strings that prepend product title before the URL
  if (!/^https?:\/\//i.test(trimmed)) {
    const embeddedUrlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (embeddedUrlMatch) {
      trimmed = embeddedUrlMatch[0];
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: '',
      domain: '',
      error: 'Girilen bağlantı formatı geçersiz. Bağlantının https:// ile başladığından emin olun.',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      isValid: false,
      normalizedUrl: '',
      domain: '',
      error: 'Sadece HTTP ve HTTPS protokolüne sahip ürün bağlantıları desteklenmektedir.',
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  // Prevent SSRF / local network URLs
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.local') ||
    !hostname.includes('.')
  ) {
    return {
      isValid: false,
      normalizedUrl: '',
      domain: '',
      error: 'Yerel ağ veya geçersiz alan adı bağlantıları güvenlik nedeniyle kabul edilmez.',
    };
  }

  // Strip tracking parameters while preserving product-defining query params
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_, key) => {
    if (TRACKING_PARAMS.has(key) || key.toLowerCase().startsWith('utm_')) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((k) => parsed.searchParams.delete(k));

  // Remove hash fragments
  parsed.hash = '';

  const domain = hostname.replace(/^www\./, '');
  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
    domain,
  };
}
