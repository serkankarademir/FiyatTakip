import { MatchConfidence, ProductSpecs } from './types';

export interface ProductComparisonResult {
  confidence: MatchConfidence;
  score: number; // 0 to 100
  includeInAutoComparison: boolean;
  reasons: string[];
  mismatches: string[];
}

const KNOWN_BRANDS = [
  'Apple',
  'Samsung',
  'Sony',
  'Xiaomi',
  'Dyson',
  'Asus',
  'Lenovo',
  'HP',
  'Dell',
  'MSI',
  'Monster',
  'Acer',
  'LG',
  'Philips',
  'Bosch',
  'Siemens',
  'Arçelik',
  'Beko',
  'Vestel',
  'Karaca',
  'Tefal',
  'Delonghi',
  'Nespresso',
  'JBL',
  'Sennheiser',
  'Bose',
  'Anker',
  'Logitech',
  'Razer',
  'SteelSeries',
  'Corsair',
  'Huawei',
  'Honor',
  'Nothing',
  'Garmin',
  'Nintendo',
  'PlayStation',
  'Xbox',
  'Canon',
  'Nikon',
  'Fujifilm',
  'GoPro',
  'DJI',
];

const VARIANT_TIERS = [
  'pro max',
  'ultra',
  'pro',
  'plus',
  'max',
  'mini',
  'slim',
  'air',
  'lite',
  'fe',
  'se',
  'oled',
  'fold',
  'flip',
];

const COLOR_MAP: Record<string, string> = {
  siyah: 'black',
  black: 'black',
  midnight: 'black',
  'gece yarısı': 'black',
  uzay: 'black',
  graphite: 'black',
  grafit: 'black',
  beyaz: 'white',
  white: 'white',
  starlight: 'white',
  'yıldız ışığı': 'white',
  gümüş: 'silver',
  silver: 'silver',
  gri: 'gray',
  gray: 'gray',
  grey: 'gray',
  mavi: 'blue',
  blue: 'blue',
  lacivert: 'blue',
  ultramarine: 'blue',
  yeşil: 'green',
  green: 'green',
  pembe: 'pink',
  pink: 'pink',
  kırmızı: 'red',
  red: 'red',
  mor: 'purple',
  purple: 'purple',
  sarı: 'yellow',
  yellow: 'yellow',
  altın: 'gold',
  gold: 'gold',
  'natürel titanyum': 'natural_titanium',
  'natural titanium': 'natural_titanium',
  'çöl titanyum': 'desert_titanium',
  'desert titanium': 'desert_titanium',
  'beyaz titanyum': 'white_titanium',
  'white titanium': 'white_titanium',
  'siyah titanyum': 'black_titanium',
  'black titanium': 'black_titanium',
   krem: 'cream',
  bej: 'cream',
};

const ACCESSORY_KEYWORDS = [
  'kılıf',
  'kilif',
  'ekran koruyucu',
  'cam koruyucu',
  'temperli cam',
  'kordon',
  'kayış',
  'şarj kablosu',
  'adaptör kılıfı',
  'sticker',
  'kaplama',
  'standı',
  'tutucu',
  'case',
  'cover',
  'screen protector',
  'silikon kılıf',
];

const BUNDLE_KEYWORDS = [
  'paket',
  'seti',
  'bundle',
  'ikili',
  '2\'li',
  '3\'lü',
  '+ kılıf',
  '+ şarj',
];

/**
 * Normalizes Turkish text for comparison while preserving alphanumeric structure.
 */
export function normalizeTextTR(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^\w\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts structured product specifications from a title and optional metadata.
 */
export function extractProductSpecs(
  title: string,
  extra?: Partial<ProductSpecs>
): ProductSpecs {
  const lowerTR = title.toLocaleLowerCase('tr-TR');
  const norm = normalizeTextTR(title);

  // 1. Detect Brand
  let brand = extra?.brand?.trim() || '';
  if (!brand) {
    for (const candidate of KNOWN_BRANDS) {
      const candidateNorm = normalizeTextTR(candidate);
      const regex = new RegExp(`\\b${candidateNorm}\\b`, 'i');
      if (regex.test(norm)) {
        brand = candidate;
        break;
      }
    }
  }
  if (!brand) {
    const firstWord = title.trim().split(/\s+/)[0] || '';
    if (firstWord.length >= 2) {
      brand = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
    }
  }

  // 2. Detect Storage & RAM
  // Match patterns like "128 GB", "256GB", "512 GB", "1 TB", "1TB", "16 GB RAM"
  let storage = extra?.storage || '';
  let ram = extra?.ram || '';

  const capMatches = Array.from(norm.matchAll(/\b(\d{1,4})\s*(gb|tb)\b/gi));
  for (const m of capMatches) {
    const val = Number(m[1]);
    const unit = m[2].toUpperCase();
    const formatted = `${val} ${unit}`;
    const afterMatch = norm.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 12);

    if (afterMatch.includes('ram') || afterMatch.includes('bellek')) {
      if (!ram) ram = formatted;
    } else if (unit === 'TB' || val >= 64) {
      if (!storage) storage = formatted;
    } else if (val <= 48 && !ram && capMatches.length > 1) {
      ram = formatted;
    } else if (!storage) {
      storage = formatted;
    }
  }

  // 3. Detect Color
  let color = extra?.color || '';
  if (!color) {
    // Check multi-word colors first
    const sortedColorKeys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedColorKeys) {
      if (lowerTR.includes(key.trim())) {
        color = COLOR_MAP[key];
        break;
      }
    }
  } else {
    const mapped = COLOR_MAP[color.toLocaleLowerCase('tr-TR')];
    if (mapped) color = mapped;
  }

  // 4. Detect Variant Tier (e.g., "Pro Max" vs "Pro" vs "Plus" vs base)
  const detectedTiers: string[] = [];
  let normForTier = norm;
  for (const tier of VARIANT_TIERS) {
    const regex = new RegExp(`\\b${tier}\\b`, 'i');
    if (regex.test(normForTier)) {
      detectedTiers.push(tier);
      normForTier = normForTier.replace(regex, ' ');
    }
  }
  const variantTier = detectedTiers.join(' ');

  // 5. Detect Generation / Model Number
  // Examples: "iPhone 16", "iPhone 15", "S24", "WH-1000XM5", "M3", "V15"
  let generation = extra?.generation || '';
  let modelNumber = extra?.modelNumber || extra?.productCode || '';

  const alphaNumModelMatches = title.match(/\b([A-Z]{1,4}[-]?[0-9]{2,5}[A-Z0-9-]{0,6})\b/g);
  if (!modelNumber && alphaNumModelMatches && alphaNumModelMatches.length > 0) {
    // Filter out storage tokens like 128GB
    const filtered = alphaNumModelMatches.filter(
      (tok) => !/^\d+(GB|TB|MB|MHZ|HZ|W|MAH)$/i.test(tok)
    );
    if (filtered.length > 0) {
      modelNumber = filtered[0].toUpperCase();
    }
  }

  // Extract family generation number (e.g., "iphone 16", "galaxy s24", "xm5", "m3", "v15", "ps5")
  const genMatch = norm.match(
    /\b(iphone\s*\d{1,2}[a-z]?|galaxy\s*[as]\d{1,2}|xm\d|v\d{1,2}|m[1234]\s*(?:pro|max)?|ps\d|ipad\s*(?:pro|air|mini)?\s*\d{0,2})\b/i
  );
  if (genMatch && !generation) {
    generation = genMatch[1].replace(/\s+/g, ' ').trim();
  }

  // 6. Detect Accessory or Bundle
  const isAccessory =
    extra?.isAccessory ??
    ACCESSORY_KEYWORDS.some((kw) => lowerTR.includes(kw));

  const isBundle =
    extra?.isBundle ??
    BUNDLE_KEYWORDS.some((kw) => lowerTR.includes(kw));

  // 7. Construct Clean Model Name
  let model = extra?.model || '';
  if (!model) {
    if (generation) {
      model = `${generation.toUpperCase()}${variantTier ? ' ' + variantTier.toUpperCase() : ''}`;
    } else if (modelNumber) {
      model = modelNumber;
    } else {
      // Take first 4 meaningful words excluding brand
      const words = title
        .replace(new RegExp(`^${brand}\\s*`, 'i'), '')
        .split(/\s+/)
        .slice(0, 4)
        .join(' ');
      model = words || title;
    }
  }

  return {
    brand,
    manufacturer: extra?.manufacturer || brand,
    model,
    modelNumber,
    sku: extra?.sku || '',
    ean: extra?.ean || '',
    upc: extra?.upc || '',
    productCode: extra?.productCode || modelNumber || '',
    storage,
    ram,
    color,
    size: extra?.size || '',
    generation,
    variantTier,
    isBundle,
    isAccessory,
  };
}

/**
 * Compares a target/reference product against a candidate store listing.
 * Strictly enforces:
 * - "Apple iPhone 16 128 GB Black" MUST NOT match "iPhone 16 256 GB" as exact/high match (classified as 'Benzer ürün')
 * - "Apple iPhone 16 128 GB Black" MUST NOT match "iPhone 16 Pro 128 GB" (classified as 'Farklı ürün')
 * - "Apple iPhone 16 128 GB Black" MUST NOT match "iPhone 15 128 GB" (classified as 'Farklı ürün')
 */
export function compareProducts(
  referenceTitle: string,
  candidateTitle: string,
  referenceExtra?: Partial<ProductSpecs>,
  candidateExtra?: Partial<ProductSpecs>
): ProductComparisonResult {
  const ref = extractProductSpecs(referenceTitle, referenceExtra);
  const cand = extractProductSpecs(candidateTitle, candidateExtra);

  const reasons: string[] = [];
  const mismatches: string[] = [];

  // 0. Check direct EAN / GTIN exact match first
  if (ref.ean && cand.ean && ref.ean.length >= 8 && ref.ean === cand.ean) {
    return {
      confidence: 'Kesin eşleşme',
      score: 100,
      includeInAutoComparison: true,
      reasons: [`EAN/Barkod kodu birebir eşleşti (${ref.ean})`],
      mismatches: [],
    };
  }

  // 1. Check Accessory vs Main Product mismatch
  if (ref.isAccessory !== cand.isAccessory) {
    return {
      confidence: 'Farklı ürün',
      score: 10,
      includeInAutoComparison: false,
      reasons: [],
      mismatches: ['Ana ürün ile aksesuar/kılıf uyuşmazlığı'],
    };
  }

  // 2. Check Brand mismatch
  if (
    ref.brand &&
    cand.brand &&
    normalizeTextTR(ref.brand) !== normalizeTextTR(cand.brand)
  ) {
    return {
      confidence: 'Farklı ürün',
      score: 15,
      includeInAutoComparison: false,
      reasons: [],
      mismatches: [`Marka farklı (${ref.brand} ≠ ${cand.brand})`],
    };
  }
  if (ref.brand && cand.brand) {
    reasons.push(`Marka eşleşti (${ref.brand})`);
  }

  // 3. Check Generation (e.g., iPhone 16 vs iPhone 15, XM5 vs XM4)
  if (ref.generation || cand.generation) {
    if (ref.generation !== cand.generation) {
      return {
        confidence: 'Farklı ürün',
        score: 20,
        includeInAutoComparison: false,
        reasons,
        mismatches: [
          `Model serisi/nesli farklı (${ref.generation || 'Belirsiz'} ≠ ${cand.generation || 'Belirsiz'})`,
        ],
      };
    }
    reasons.push(`Model nesli eşleşti (${(ref.generation || '').toUpperCase()})`);
  }

  // 4. Check Alphanumeric Model Number (e.g., WH-1000XM5 vs WH-1000XM4)
  if (ref.modelNumber && cand.modelNumber) {
    const normRefModel = ref.modelNumber.replace(/[-_\s]/g, '');
    const normCandModel = cand.modelNumber.replace(/[-_\s]/g, '');
    if (normRefModel !== normCandModel) {
      return {
        confidence: 'Farklı ürün',
        score: 25,
        includeInAutoComparison: false,
        reasons,
        mismatches: [`Model kodu farklı (${ref.modelNumber} ≠ ${cand.modelNumber})`],
      };
    }
    reasons.push(`Model kodu birebir eşleşti (${ref.modelNumber})`);
  }

  // 5. Check Variant Tier (e.g., iPhone 16 vs iPhone 16 Pro vs iPhone 16 Pro Max)
  if ((ref.variantTier || '') !== (cand.variantTier || '')) {
    return {
      confidence: 'Farklı ürün',
      score: 30,
      includeInAutoComparison: false,
      reasons,
      mismatches: [
        `Model varyantı farklı (${ref.variantTier || 'Standart'} ≠ ${cand.variantTier || 'Standart'})`,
      ],
    };
  }

  // 6. Check Token Overlap for general products without explicit generation
  const refTokens = normalizeTextTR(referenceTitle)
    .split(' ')
    .filter((w) => w.length > 1);
  const candTokens = new Set(
    normalizeTextTR(candidateTitle)
      .split(' ')
      .filter((w) => w.length > 1)
  );
  const commonCount = refTokens.filter((t) => candTokens.has(t)).length;
  const overlapRatio = refTokens.length > 0 ? commonCount / refTokens.length : 0;

  if (overlapRatio < 0.35 && !ref.modelNumber && !ref.generation) {
    return {
      confidence: 'Farklı ürün',
      score: Math.round(overlapRatio * 100),
      includeInAutoComparison: false,
      reasons,
      mismatches: ['Ürün başlığı benzerliği çok düşük'],
    };
  }

  // 7. Check Storage Capacity (e.g. 128 GB vs 256 GB)
  // If storage differs on the same model, it is a "Benzer ürün" (Same model with different storage), NOT an exact match!
  let storageMismatch = false;
  if (ref.storage && cand.storage) {
    if (ref.storage !== cand.storage) {
      storageMismatch = true;
      mismatches.push(`Depolama kapasitesi farklı (${ref.storage} ≠ ${cand.storage})`);
    } else {
      reasons.push(`Depolama kapasitesi eşleşti (${ref.storage})`);
    }
  } else if (ref.storage && !cand.storage) {
    mismatches.push(`Aday üründe depolama kapasitesi (${ref.storage}) belirtilmemiş`);
  }

  // 8. Check RAM
  let ramMismatch = false;
  if (ref.ram && cand.ram && ref.ram !== cand.ram) {
    ramMismatch = true;
    mismatches.push(`RAM kapasitesi farklı (${ref.ram} ≠ ${cand.ram})`);
  }

  // 9. Check Color
  let colorMismatch = false;
  if (ref.color && cand.color) {
    if (ref.color !== cand.color) {
      colorMismatch = true;
      mismatches.push(`Renk farklı (${ref.color} ≠ ${cand.color})`);
    } else {
      reasons.push(`Renk eşleşti`);
    }
  }

  // 10. Check Bundle status
  if (ref.isBundle !== cand.isBundle) {
    return {
      confidence: 'Benzer ürün',
      score: 60,
      includeInAutoComparison: false,
      reasons,
      mismatches: [...mismatches, 'Tekli ürün / Paket (Bundle) farkı'],
    };
  }

  // If storage or RAM differs on the exact same model, classify as "Benzer ürün" and exclude from automatic price comparison
  if (storageMismatch || ramMismatch) {
    return {
      confidence: 'Benzer ürün',
      score: 68,
      includeInAutoComparison: false,
      reasons,
      mismatches,
    };
  }

  // If color explicitly differs on the same model/storage, classify as "Benzer ürün" (or "Yüksek eşleşme" if user didn't lock color)
  if (colorMismatch) {
    return {
      confidence: 'Benzer ürün',
      score: 74,
      includeInAutoComparison: false,
      reasons,
      mismatches,
    };
  }

  // If SKU or modelNumber or (generation + storage + color) all match -> "Kesin eşleşme"
  const hasStrongIdentity =
    Boolean(ref.sku && cand.sku && ref.sku === cand.sku) ||
    Boolean(ref.modelNumber && cand.modelNumber && ref.modelNumber === cand.modelNumber) ||
    Boolean(ref.generation && (!ref.storage || ref.storage === cand.storage) && (!ref.color || ref.color === cand.color));

  if (hasStrongIdentity && mismatches.length === 0) {
    return {
      confidence: 'Kesin eşleşme',
      score: 98,
      includeInAutoComparison: true,
      reasons,
      mismatches: [],
    };
  }

  if (overlapRatio >= 0.75 && mismatches.length === 0) {
    return {
      confidence: 'Kesin eşleşme',
      score: 94,
      includeInAutoComparison: true,
      reasons,
      mismatches: [],
    };
  }

  if (overlapRatio >= 0.5 || hasStrongIdentity) {
    return {
      confidence: 'Yüksek eşleşme',
      score: 85,
      includeInAutoComparison: true,
      reasons,
      mismatches,
    };
  }

  return {
    confidence: 'Benzer ürün',
    score: 65,
    includeInAutoComparison: false,
    reasons,
    mismatches,
  };
}
