import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import {
  AvailabilityState,
  CurrencyCode,
  LogCategory,
  LogLevel,
  MatchConfidence,
  NotificationRecord,
  NotificationType,
  OfferRecord,
  PriceHistoryRecord,
  PriceStatus,
  ProductRecord,
  StoreConnectionStatus,
  StoreRecord,
  SystemLogRecord,
  UserSettings,
} from '../shared/types';
import { decryptSecret, encryptSecret, maskSecret } from './cryptoVault';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'fiyat_takip.sqlite');

export const INITIAL_TURKISH_STORES: Array<{ id: string; name: string; domain: string }> = [
  { id: 'trendyol', name: 'Trendyol', domain: 'trendyol.com' },
  { id: 'hepsiburada', name: 'Hepsiburada', domain: 'hepsiburada.com' },
  { id: 'amazon_tr', name: 'Amazon Türkiye', domain: 'amazon.com.tr' },
  { id: 'n11', name: 'N11', domain: 'n11.com' },
  { id: 'ciceksepeti', name: 'ÇiçekSepeti', domain: 'ciceksepeti.com' },
  { id: 'mediamarkt', name: 'MediaMarkt Türkiye', domain: 'mediamarkt.com.tr' },
  { id: 'teknosa', name: 'Teknosa', domain: 'teknosa.com' },
  { id: 'vatan', name: 'Vatan Bilgisayar', domain: 'vatanbilgisayar.com' },
  { id: 'pazarama', name: 'Pazarama', domain: 'pazarama.com' },
  { id: 'akakce', name: 'Akakçe', domain: 'akakce.com' },
  { id: 'cimri', name: 'Cimri', domain: 'cimri.com' },
];

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  language: 'tr',
  runInBackground: true,
  launchAtStartup: false,
  firstRunCompleted: false,
  devModeEnabled: false,
  checkFrequency: 'daily_1',
  preferredCheckTime: '09:00',
  dropRuleType: 'any',
  minDropPercent: 5,
  minDropAmount: 500,
  notifyOnTargetReached: true,
  notifyOnRestock: true,
  notifyOnPriceIncrease: false,
  macosNotificationsEnabled: true,
  emailNotificationsEnabled: false,
  emailRecipient: '',
  emailSmtpHost: 'smtp.gmail.com',
  emailSmtpPort: 587,
  emailSmtpUser: '',
  emailSmtpPasswordSet: false,
  telegramNotificationsEnabled: false,
  telegramBotTokenSet: false,
  telegramBotTokenMasked: '',
  telegramChatId: '',
};

let dbInstance: SqlJsDatabase | null = null;
let initPromise: Promise<SqlJsDatabase> | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db: SqlJsDatabase;

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    initializeSchema(db);
    dbInstance = db;
    persistDb(db);
    return db;
  })();

  return initPromise;
}

export function persistDb(db: SqlJsDatabase | null = dbInstance): void {
  if (!db) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = db.export();
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error('Failed to persist SQLite database:', err);
  }
}

function initializeSchema(db: SqlJsDatabase): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      model TEXT DEFAULT '',
      product_code TEXT DEFAULT '',
      ean TEXT DEFAULT '',
      image TEXT DEFAULT '',
      original_url TEXT NOT NULL,
      target_price REAL,
      currency TEXT DEFAULT 'TRY',
      storage TEXT DEFAULT '',
      ram TEXT DEFAULT '',
      color TEXT DEFAULT '',
      size TEXT DEFAULT '',
      generation TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'unknown',
      last_successful_check TEXT,
      last_checked_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      url TEXT NOT NULL,
      seller TEXT DEFAULT '',
      price REAL,
      previous_price REAL,
      currency TEXT DEFAULT 'TRY',
      availability TEXT DEFAULT 'Bilinmiyor',
      match_confidence TEXT DEFAULT 'Kesin eşleşme',
      match_score INTEGER DEFAULT 100,
      match_title TEXT DEFAULT '',
      price_status TEXT DEFAULT 'verified',
      suspicious_price REAL,
      suspicious_reason TEXT,
      checked_at TEXT,
      last_error TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      price REAL NOT NULL,
      old_price REAL,
      currency TEXT DEFAULT 'TRY',
      availability TEXT DEFAULT 'Stokta',
      is_suspicious INTEGER DEFAULT 0,
      checked_at TEXT NOT NULL,
      FOREIGN KEY(offer_id) REFERENCES offers(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      store_id TEXT,
      store_name TEXT DEFAULT '',
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      old_price REAL,
      new_price REAL,
      drop_amount REAL,
      drop_percent REAL,
      currency TEXT DEFAULT 'TRY',
      product_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      sent INTEGER DEFAULT 1,
      read INTEGER DEFAULT 0,
      dedup_key TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  // Seed default supported Turkish stores if missing (Note: status is 'unknown' until actually checked!)
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO stores (id, name, domain, enabled, status, last_successful_check, last_checked_at, last_error)
    VALUES (?, ?, ?, 1, 'unknown', NULL, NULL, NULL)
  `);
  for (const s of INITIAL_TURKISH_STORES) {
    stmt.run([s.id, s.name, s.domain]);
  }
  stmt.free();
}

function queryAll<T = Record<string, unknown>>(
  db: SqlJsDatabase,
  sql: string,
  params: (string | number | null)[] = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function queryOne<T = Record<string, unknown>>(
  db: SqlJsDatabase,
  sql: string,
  params: (string | number | null)[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Internal Logging System (Section 31)
 */
export async function addSystemLog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  details: string | Record<string, unknown> = ''
): Promise<void> {
  const db = await getDb();
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO system_logs (id, level, category, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, level, category, message, detailsStr, now]
  );

  // Keep most recent 500 logs
  db.run(`
    DELETE FROM system_logs WHERE id NOT IN (
      SELECT id FROM system_logs ORDER BY created_at DESC LIMIT 500
    )
  `);
  persistDb(db);
}

export async function getSystemLogs(limit: number = 200, category?: string): Promise<SystemLogRecord[]> {
  const db = await getDb();
  if (category && category !== 'ALL') {
    return queryAll<SystemLogRecord>(
      db,
      `SELECT * FROM system_logs WHERE category = ? ORDER BY created_at DESC LIMIT ?`,
      [category, limit]
    );
  }
  return queryAll<SystemLogRecord>(
    db,
    `SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}

export async function clearSystemLogs(): Promise<void> {
  const db = await getDb();
  db.run(`DELETE FROM system_logs`);
  persistDb(db);
}

/**
 * User Settings Management
 */
export async function getUserSettings(): Promise<UserSettings> {
  const db = await getDb();
  const rows = queryAll<{ key: string; value: string }>(db, `SELECT key, value FROM user_settings`);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.key, r.value);
  }

  const getBool = (k: string, def: boolean) =>
    map.has(k) ? map.get(k) === 'true' : def;
  const getNum = (k: string, def: number) =>
    map.has(k) ? Number(map.get(k)) || def : def;
  const getStr = <T extends string>(k: string, def: T): T =>
    (map.has(k) ? (map.get(k) as T) : def);

  const decryptedTelegramToken = decryptSecret(map.get('telegramBotTokenEncrypted') || '');
  const decryptedSmtpPassword = decryptSecret(map.get('emailSmtpPasswordEncrypted') || '');

  return {
    theme: getStr('theme', DEFAULT_USER_SETTINGS.theme),
    language: 'tr',
    runInBackground: getBool('runInBackground', DEFAULT_USER_SETTINGS.runInBackground),
    launchAtStartup: getBool('launchAtStartup', DEFAULT_USER_SETTINGS.launchAtStartup),
    firstRunCompleted: getBool('firstRunCompleted', DEFAULT_USER_SETTINGS.firstRunCompleted),
    devModeEnabled: getBool('devModeEnabled', DEFAULT_USER_SETTINGS.devModeEnabled),
    checkFrequency: getStr('checkFrequency', DEFAULT_USER_SETTINGS.checkFrequency),
    preferredCheckTime: getStr('preferredCheckTime', DEFAULT_USER_SETTINGS.preferredCheckTime),
    dropRuleType: getStr('dropRuleType', DEFAULT_USER_SETTINGS.dropRuleType),
    minDropPercent: getNum('minDropPercent', DEFAULT_USER_SETTINGS.minDropPercent),
    minDropAmount: getNum('minDropAmount', DEFAULT_USER_SETTINGS.minDropAmount),
    notifyOnTargetReached: getBool('notifyOnTargetReached', DEFAULT_USER_SETTINGS.notifyOnTargetReached),
    notifyOnRestock: getBool('notifyOnRestock', DEFAULT_USER_SETTINGS.notifyOnRestock),
    notifyOnPriceIncrease: getBool('notifyOnPriceIncrease', DEFAULT_USER_SETTINGS.notifyOnPriceIncrease),
    macosNotificationsEnabled: getBool('macosNotificationsEnabled', DEFAULT_USER_SETTINGS.macosNotificationsEnabled),
    emailNotificationsEnabled: getBool('emailNotificationsEnabled', DEFAULT_USER_SETTINGS.emailNotificationsEnabled),
    emailRecipient: getStr('emailRecipient', DEFAULT_USER_SETTINGS.emailRecipient),
    emailSmtpHost: getStr('emailSmtpHost', DEFAULT_USER_SETTINGS.emailSmtpHost),
    emailSmtpPort: getNum('emailSmtpPort', DEFAULT_USER_SETTINGS.emailSmtpPort),
    emailSmtpUser: getStr('emailSmtpUser', DEFAULT_USER_SETTINGS.emailSmtpUser),
    emailSmtpPasswordSet: Boolean(decryptedSmtpPassword),
    telegramNotificationsEnabled: getBool('telegramNotificationsEnabled', DEFAULT_USER_SETTINGS.telegramNotificationsEnabled),
    telegramBotTokenSet: Boolean(decryptedTelegramToken),
    telegramBotTokenMasked: maskSecret(decryptedTelegramToken),
    telegramChatId: getStr('telegramChatId', DEFAULT_USER_SETTINGS.telegramChatId),
  };
}

export async function getDecryptedCredentials(): Promise<{
  telegramBotToken: string;
  emailSmtpPassword: string;
}> {
  const db = await getDb();
  const tgRow = queryOne<{ value: string }>(
    db,
    `SELECT value FROM user_settings WHERE key = 'telegramBotTokenEncrypted'`
  );
  const smtpRow = queryOne<{ value: string }>(
    db,
    `SELECT value FROM user_settings WHERE key = 'emailSmtpPasswordEncrypted'`
  );
  return {
    telegramBotToken: decryptSecret(tgRow?.value || ''),
    emailSmtpPassword: decryptSecret(smtpRow?.value || ''),
  };
}

export async function updateUserSettings(
  updates: Partial<UserSettings> & {
    telegramBotToken?: string;
    emailSmtpPassword?: string;
  }
): Promise<UserSettings> {
  const db = await getDb();
  const now = new Date().toISOString();

  const upsert = (key: string, val: string) => {
    db.run(
      `INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, val, now]
    );
  };

  const allowedKeys: (keyof UserSettings)[] = [
    'theme',
    'runInBackground',
    'launchAtStartup',
    'firstRunCompleted',
    'devModeEnabled',
    'checkFrequency',
    'preferredCheckTime',
    'dropRuleType',
    'minDropPercent',
    'minDropAmount',
    'notifyOnTargetReached',
    'notifyOnRestock',
    'notifyOnPriceIncrease',
    'macosNotificationsEnabled',
    'emailNotificationsEnabled',
    'emailRecipient',
    'emailSmtpHost',
    'emailSmtpPort',
    'emailSmtpUser',
    'telegramNotificationsEnabled',
    'telegramChatId',
  ];

  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      upsert(key, String(updates[key]));
    }
  }

  if (updates.telegramBotToken !== undefined) {
    const trimmed = updates.telegramBotToken.trim();
    upsert('telegramBotTokenEncrypted', trimmed ? encryptSecret(trimmed) : '');
  }

  if (updates.emailSmtpPassword !== undefined) {
    const trimmed = updates.emailSmtpPassword.trim();
    upsert('emailSmtpPasswordEncrypted', trimmed ? encryptSecret(trimmed) : '');
  }

  persistDb(db);
  return getUserSettings();
}

/**
 * Stores Management
 */
export async function getAllStores(): Promise<StoreRecord[]> {
  const db = await getDb();
  const stores = queryAll<{
    id: string;
    name: string;
    domain: string;
    enabled: number;
    status: StoreConnectionStatus;
    last_successful_check: string | null;
    last_checked_at: string | null;
    last_error: string | null;
  }>(db, `SELECT * FROM stores ORDER BY name ASC`);

  const counts = queryAll<{ store_id: string; cnt: number }>(
    db,
    `SELECT store_id, COUNT(*) as cnt FROM offers GROUP BY store_id`
  );
  const countMap = new Map(counts.map((c) => [c.store_id, Number(c.cnt)]));

  return stores.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    enabled: Boolean(s.enabled),
    status: s.status,
    last_successful_check: s.last_successful_check,
    last_checked_at: s.last_checked_at,
    last_error: s.last_error,
    tracked_offers_count: countMap.get(s.id) || 0,
  }));
}

export async function updateStoreStatus(params: {
  storeId: string;
  status: StoreConnectionStatus;
  error?: string | null;
  enabled?: boolean;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  if (params.enabled !== undefined) {
    db.run(`UPDATE stores SET enabled = ? WHERE id = ?`, [params.enabled ? 1 : 0, params.storeId]);
  }

  if (params.status === 'operational') {
    db.run(
      `UPDATE stores SET status = 'operational', last_successful_check = ?, last_checked_at = ?, last_error = NULL WHERE id = ?`,
      [now, now, params.storeId]
    );
  } else if (params.status === 'unavailable') {
    db.run(
      `UPDATE stores SET status = 'unavailable', last_checked_at = ?, last_error = ? WHERE id = ?`,
      [now, params.error || 'Bu mağazanın fiyatı şu anda kontrol edilemedi.', params.storeId]
    );
  }
  persistDb(db);
}

/**
 * Products & Offers Management
 */
export async function getAllProducts(): Promise<ProductRecord[]> {
  const db = await getDb();
  const rawProducts = queryAll<{
    id: string;
    name: string;
    brand: string;
    model: string;
    product_code: string;
    ean: string;
    image: string;
    original_url: string;
    target_price: number | null;
    currency: CurrencyCode;
    storage: string;
    ram: string;
    color: string;
    size: string;
    generation: string;
    created_at: string;
    active: number;
  }>(db, `SELECT * FROM products ORDER BY created_at DESC`);

  const allOffers = await getAllOffers();
  const offersByProduct = new Map<string, OfferRecord[]>();
  for (const offer of allOffers) {
    const list = offersByProduct.get(offer.product_id) || [];
    list.push(offer);
    offersByProduct.set(offer.product_id, list);
  }

  // Also get earliest price per product from price_history for baseline comparison
  const historyRows = queryAll<{ product_id: string; price: number; checked_at: string }>(
    db,
    `SELECT product_id, price, checked_at FROM price_history WHERE is_suspicious = 0 ORDER BY checked_at ASC`
  );
  const firstPriceMap = new Map<string, number>();
  for (const h of historyRows) {
    if (!firstPriceMap.has(h.product_id) && h.price > 0) {
      firstPriceMap.set(h.product_id, h.price);
    }
  }

  return rawProducts.map((p) => {
    const productOffers = offersByProduct.get(p.id) || [];

    // Only include "Kesin eşleşme" and "Yüksek eşleşme" with valid numeric prices in automatic comparison
    const eligibleOffers = productOffers.filter(
      (o) =>
        (o.match_confidence === 'Kesin eşleşme' || o.match_confidence === 'Yüksek eşleşme') &&
        o.price !== null &&
        o.price > 0 &&
        o.price_status !== 'suspicious'
    );

    eligibleOffers.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

    const lowestOffer = eligibleOffers[0] || null;
    const currentLowestPrice = lowestOffer ? lowestOffer.price : null;
    const currentLowestStore = lowestOffer ? lowestOffer.store_name : null;

    // Determine previous reference price for comparison
    let previousLowestPrice: number | null = null;
    if (lowestOffer && lowestOffer.previous_price && lowestOffer.previous_price > 0) {
      previousLowestPrice = lowestOffer.previous_price;
    } else if (firstPriceMap.has(p.id)) {
      previousLowestPrice = firstPriceMap.get(p.id) || null;
    }

    let priceChangeAmount: number | null = null;
    let priceChangePercent: number | null = null;
    if (
      currentLowestPrice !== null &&
      previousLowestPrice !== null &&
      previousLowestPrice > 0
    ) {
      priceChangeAmount = Math.round((currentLowestPrice - previousLowestPrice) * 100) / 100;
      priceChangePercent =
        Math.round(((currentLowestPrice - previousLowestPrice) / previousLowestPrice) * 10000) / 100;
    }

    // Last checked timestamp across offers
    const checkedTimestamps = productOffers
      .map((o) => o.checked_at)
      .filter((t): t is string => Boolean(t))
      .sort()
      .reverse();
    const lastCheckedAt = checkedTimestamps[0] || null;

    // Availability summary
    const anyInStock = productOffers.some((o) => o.availability === 'Stokta');
    const allOut =
      productOffers.length > 0 && productOffers.every((o) => o.availability === 'Tükendi');
    const availabilitySummary: AvailabilityState = anyInStock
      ? 'Stokta'
      : allOut
      ? 'Tükendi'
      : 'Bilinmiyor';

    const hasSuspiciousPrice = productOffers.some((o) => o.price_status === 'suspicious');

    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      model: p.model,
      product_code: p.product_code,
      ean: p.ean,
      image: p.image,
      original_url: p.original_url,
      target_price: p.target_price,
      currency: p.currency || 'TRY',
      storage: p.storage,
      ram: p.ram,
      color: p.color,
      size: p.size,
      generation: p.generation,
      created_at: p.created_at,
      active: Boolean(p.active),
      current_lowest_price: currentLowestPrice,
      current_lowest_store: currentLowestStore,
      previous_lowest_price: previousLowestPrice,
      initial_price: firstPriceMap.get(p.id) || previousLowestPrice || currentLowestPrice,
      price_change_amount: priceChangeAmount,
      price_change_percent: priceChangePercent,
      last_checked_at: lastCheckedAt,
      availability_summary: availabilitySummary,
      has_suspicious_price: hasSuspiciousPrice,
      offers: productOffers,
    };
  });
}

export async function getProductById(productId: string): Promise<ProductRecord | null> {
  const all = await getAllProducts();
  return all.find((p) => p.id === productId) || null;
}

export async function getAllOffers(): Promise<OfferRecord[]> {
  const db = await getDb();
  return queryAll<OfferRecord>(
    db,
    `SELECT o.*, s.name as store_name, s.domain as store_domain
     FROM offers o
     LEFT JOIN stores s ON o.store_id = s.id
     ORDER BY CASE WHEN o.price IS NULL THEN 1 ELSE 0 END, o.price ASC`
  );
}

export async function createProductWithOffers(params: {
  name: string;
  brand: string;
  model: string;
  productCode: string;
  ean: string;
  image: string;
  originalUrl: string;
  targetPrice: number | null;
  currency: CurrencyCode;
  storage: string;
  ram: string;
  color: string;
  size: string;
  generation: string;
  offers: Array<{
    storeId: string;
    url: string;
    seller: string;
    price: number | null;
    currency: CurrencyCode;
    availability: AvailabilityState;
    matchConfidence: MatchConfidence;
    matchScore: number;
    matchTitle: string;
    priceStatus: PriceStatus;
    lastError?: string | null;
  }>;
}): Promise<ProductRecord> {
  const db = await getDb();
  const productId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO products (
      id, name, brand, model, product_code, ean, image, original_url,
      target_price, currency, storage, ram, color, size, generation, created_at, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      productId,
      params.name,
      params.brand,
      params.model,
      params.productCode,
      params.ean,
      params.image,
      params.originalUrl,
      params.targetPrice,
      params.currency,
      params.storage,
      params.ram,
      params.color,
      params.size,
      params.generation,
      now,
    ]
  );

  for (const o of params.offers) {
    const offerId = `off_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.run(
      `INSERT INTO offers (
        id, product_id, store_id, url, seller, price, previous_price, currency,
        availability, match_confidence, match_score, match_title, price_status,
        suspicious_price, suspicious_reason, checked_at, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [
        offerId,
        productId,
        o.storeId,
        o.url,
        o.seller || '',
        o.price,
        o.currency || 'TRY',
        o.availability,
        o.matchConfidence,
        o.matchScore,
        o.matchTitle || params.name,
        o.priceStatus,
        now,
        o.lastError || null,
      ]
    );

    if (o.price !== null && o.price > 0) {
      const histId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.run(
        `INSERT INTO price_history (
          id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, ?)`,
        [histId, offerId, productId, o.storeId, o.price, o.currency || 'TRY', o.availability, now]
      );
    }
  }

  // Mark firstRunCompleted = true once first product is added
  await updateUserSettings({ firstRunCompleted: true });
  persistDb(db);

  await addSystemLog('INFO', 'SYSTEM', `Yeni ürün takibe eklendi: ${params.name}`, {
    productId,
    offersCount: params.offers.length,
  });

  const created = await getProductById(productId);
  if (!created) {
    throw new Error('Ürün kaydedildikten sonra okunamadı.');
  }
  return created;
}

export async function updateProductSettings(
  productId: string,
  updates: {
    targetPrice?: number | null;
    active?: boolean;
    name?: string;
  }
): Promise<ProductRecord | null> {
  const db = await getDb();
  if (updates.targetPrice !== undefined) {
    db.run(`UPDATE products SET target_price = ? WHERE id = ?`, [updates.targetPrice, productId]);
  }
  if (updates.active !== undefined) {
    db.run(`UPDATE products SET active = ? WHERE id = ?`, [updates.active ? 1 : 0, productId]);
  }
  if (updates.name !== undefined && updates.name.trim()) {
    db.run(`UPDATE products SET name = ? WHERE id = ?`, [updates.name.trim(), productId]);
  }
  persistDb(db);
  return getProductById(productId);
}

export async function deleteProduct(productId: string): Promise<void> {
  const db = await getDb();
  db.run(`DELETE FROM price_history WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM offers WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM notifications WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM products WHERE id = ?`, [productId]);
  persistDb(db);
}

export async function getProductPriceHistory(
  productId: string,
  days?: number
): Promise<PriceHistoryRecord[]> {
  const db = await getDb();
  let sql = `
    SELECT ph.*, s.name as store_name
    FROM price_history ph
    LEFT JOIN stores s ON ph.store_id = s.id
    WHERE ph.product_id = ? AND ph.is_suspicious = 0
  `;
  const params: (string | number | null)[] = [productId];

  if (days && days > 0) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    sql += ` AND ph.checked_at >= ?`;
    params.push(cutoff);
  }

  sql += ` ORDER BY ph.checked_at ASC`;
  return queryAll<PriceHistoryRecord>(db, sql, params);
}

export async function getAllPriceDrops(): Promise<
  Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_image: string;
    brand: string;
    store_id: string;
    store_name: string;
    old_price: number;
    new_price: number;
    drop_amount: number;
    drop_percent: number;
    currency: CurrencyCode;
    checked_at: string;
    product_url: string;
  }>
> {
  const db = await getDb();
  // Query from notifications of type price_drop or target_reached OR price_history where old_price > price
  const rows = queryAll<{
    id: string;
    product_id: string;
    product_name: string;
    product_image: string;
    brand: string;
    store_id: string;
    store_name: string;
    old_price: number;
    price: number;
    currency: CurrencyCode;
    checked_at: string;
    url: string;
  }>(
    db,
    `SELECT ph.id, ph.product_id, p.name as product_name, p.image as product_image, p.brand,
            ph.store_id, s.name as store_name, ph.old_price, ph.price, ph.currency, ph.checked_at,
            o.url
     FROM price_history ph
     INNER JOIN products p ON ph.product_id = p.id
     LEFT JOIN stores s ON ph.store_id = s.id
     LEFT JOIN offers o ON ph.offer_id = o.id
     WHERE ph.old_price IS NOT NULL AND ph.old_price > ph.price AND ph.is_suspicious = 0
     ORDER BY ph.checked_at DESC`
  );

  return rows.map((r) => {
    const dropAmount = Math.round((r.old_price - r.price) * 100) / 100;
    const dropPercent = Math.round(((r.old_price - r.price) / r.old_price) * 10000) / 100;
    return {
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      product_image: r.product_image,
      brand: r.brand,
      store_id: r.store_id,
      store_name: r.store_name || r.store_id,
      old_price: r.old_price,
      new_price: r.price,
      drop_amount: dropAmount,
      drop_percent: dropPercent,
      currency: r.currency || 'TRY',
      checked_at: r.checked_at,
      product_url: r.url || '',
    };
  });
}

/**
 * Notifications Table Operations with Deduplication (Section 12 & 42)
 */
export async function getAllNotifications(): Promise<NotificationRecord[]> {
  const db = await getDb();
  return queryAll<NotificationRecord>(
    db,
    `SELECT n.*, p.name as product_name, p.image as product_image
     FROM notifications n
     LEFT JOIN products p ON n.product_id = p.id
     ORDER BY n.created_at DESC
     LIMIT 200`
  );
}

export async function hasNotificationWithDedupKey(dedupKey: string): Promise<boolean> {
  if (!dedupKey) return false;
  const db = await getDb();
  const row = queryOne<{ id: string }>(
    db,
    `SELECT id FROM notifications WHERE dedup_key = ? LIMIT 1`,
    [dedupKey]
  );
  return Boolean(row);
}

export async function insertNotificationRecord(params: {
  productId: string | null;
  storeId: string | null;
  storeName: string;
  type: NotificationType;
  title: string;
  message: string;
  oldPrice: number | null;
  newPrice: number | null;
  dropAmount: number | null;
  dropPercent: number | null;
  currency?: CurrencyCode;
  productUrl: string;
  dedupKey: string;
}): Promise<NotificationRecord | null> {
  const db = await getDb();

  if (params.dedupKey && (await hasNotificationWithDedupKey(params.dedupKey))) {
    await addSystemLog(
      'DEBUG',
      'NOTIFICATION',
      `Mükerrer bildirim engellendi (${params.dedupKey})`,
      params.title
    );
    return null;
  }

  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO notifications (
      id, product_id, store_id, store_name, type, title, message,
      old_price, new_price, drop_amount, drop_percent, currency,
      product_url, created_at, sent, read, dedup_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    [
      id,
      params.productId,
      params.storeId,
      params.storeName,
      params.type,
      params.title,
      params.message,
      params.oldPrice,
      params.newPrice,
      params.dropAmount,
      params.dropPercent,
      params.currency || 'TRY',
      params.productUrl,
      now,
      params.dedupKey,
    ]
  );
  persistDb(db);

  return queryOne<NotificationRecord>(
    db,
    `SELECT n.*, p.name as product_name, p.image as product_image
     FROM notifications n
     LEFT JOIN products p ON n.product_id = p.id
     WHERE n.id = ?`,
    [id]
  );
}

export async function markNotificationsRead(notificationId?: string): Promise<void> {
  const db = await getDb();
  if (notificationId) {
    db.run(`UPDATE notifications SET read = 1 WHERE id = ?`, [notificationId]);
  } else {
    db.run(`UPDATE notifications SET read = 1`);
  }
  persistDb(db);
}

/**
 * Suspicious Price Resolution (Section 18)
 */
export async function resolveSuspiciousOfferPrice(
  offerId: string,
  action: 'approve' | 'reject'
): Promise<void> {
  const db = await getDb();
  const offer = queryOne<OfferRecord>(db, `SELECT * FROM offers WHERE id = ?`, [offerId]);
  if (!offer || offer.suspicious_price === null) return;

  const now = new Date().toISOString();
  if (action === 'approve') {
    const oldPrice = offer.price;
    const newPrice = offer.suspicious_price;
    db.run(
      `UPDATE offers
       SET previous_price = ?, price = ?, price_status = 'verified',
           suspicious_price = NULL, suspicious_reason = NULL, checked_at = ?
       WHERE id = ?`,
      [oldPrice, newPrice, now, offerId]
    );
    const histId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.run(
      `INSERT INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [histId, offer.id, offer.product_id, offer.store_id, newPrice, oldPrice, offer.currency, offer.availability, now]
    );
    await addSystemLog('INFO', 'PRICE_CHECK', `Şüpheli fiyat kullanıcı tarafından onaylandı: ${newPrice} TL`, { offerId });
  } else {
    db.run(
      `UPDATE offers
       SET price_status = 'last_known', suspicious_price = NULL, suspicious_reason = NULL
       WHERE id = ?`,
      [offerId]
    );
    await addSystemLog('INFO', 'PRICE_CHECK', `Şüpheli fiyat kullanıcı tarafından reddedildi.`, { offerId });
  }
  persistDb(db);
}

/**
 * Export & Import Backup (Section 25)
 */
export async function exportDatabaseBackup(): Promise<{
  version: string;
  exportedAt: string;
  app: string;
  products: unknown[];
  offers: unknown[];
  priceHistory: unknown[];
  settings: UserSettings;
}> {
  const db = await getDb();
  const products = queryAll(db, `SELECT * FROM products`);
  const offers = queryAll(db, `SELECT * FROM offers`);
  const priceHistory = queryAll(db, `SELECT * FROM price_history`);
  const settings = await getUserSettings();

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    app: 'Fiyat Takip Agent',
    products,
    offers,
    priceHistory,
    settings,
  };
}

export async function importDatabaseBackup(
  backupData: {
    products?: Record<string, unknown>[];
    offers?: Record<string, unknown>[];
    priceHistory?: Record<string, unknown>[];
  },
  overwriteExisting: boolean = false
): Promise<{ importedProducts: number; skippedProducts: number }> {
  const db = await getDb();
  const products = Array.isArray(backupData.products) ? backupData.products : [];
  const offers = Array.isArray(backupData.offers) ? backupData.offers : [];
  const priceHistory = Array.isArray(backupData.priceHistory) ? backupData.priceHistory : [];

  let importedProducts = 0;
  let skippedProducts = 0;

  for (const p of products) {
    const id = String(p.id || '');
    if (!id || !p.name || !p.original_url) continue;

    const existing = queryOne(db, `SELECT id FROM products WHERE id = ?`, [id]);
    if (existing && !overwriteExisting) {
      skippedProducts++;
      continue;
    }

    if (existing && overwriteExisting) {
      await deleteProduct(id);
    }

    db.run(
      `INSERT INTO products (
        id, name, brand, model, product_code, ean, image, original_url,
        target_price, currency, storage, ram, color, size, generation, created_at, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(p.name),
        String(p.brand || ''),
        String(p.model || ''),
        String(p.product_code || ''),
        String(p.ean || ''),
        String(p.image || ''),
        String(p.original_url),
        p.target_price !== null && p.target_price !== undefined ? Number(p.target_price) : null,
        String(p.currency || 'TRY'),
        String(p.storage || ''),
        String(p.ram || ''),
        String(p.color || ''),
        String(p.size || ''),
        String(p.generation || ''),
        String(p.created_at || new Date().toISOString()),
        p.active === 0 ? 0 : 1,
      ]
    );
    importedProducts++;
  }

  for (const o of offers) {
    const id = String(o.id || '');
    const productId = String(o.product_id || '');
    if (!id || !productId) continue;
    const prodExists = queryOne(db, `SELECT id FROM products WHERE id = ?`, [productId]);
    if (!prodExists) continue;

    db.run(
      `INSERT OR REPLACE INTO offers (
        id, product_id, store_id, url, seller, price, previous_price, currency,
        availability, match_confidence, match_score, match_title, price_status,
        suspicious_price, suspicious_reason, checked_at, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        productId,
        String(o.store_id || 'trendyol'),
        String(o.url || ''),
        String(o.seller || ''),
        o.price !== null && o.price !== undefined ? Number(o.price) : null,
        o.previous_price !== null && o.previous_price !== undefined ? Number(o.previous_price) : null,
        String(o.currency || 'TRY'),
        String(o.availability || 'Bilinmiyor'),
        String(o.match_confidence || 'Kesin eşleşme'),
        Number(o.match_score ?? 100),
        String(o.match_title || ''),
        String(o.price_status || 'verified'),
        o.suspicious_price !== null && o.suspicious_price !== undefined ? Number(o.suspicious_price) : null,
        o.suspicious_reason ? String(o.suspicious_reason) : null,
        o.checked_at ? String(o.checked_at) : null,
        o.last_error ? String(o.last_error) : null,
      ]
    );
  }

  for (const ph of priceHistory) {
    const id = String(ph.id || '');
    const productId = String(ph.product_id || '');
    if (!id || !productId) continue;
    const prodExists = queryOne(db, `SELECT id FROM products WHERE id = ?`, [productId]);
    if (!prodExists) continue;

    db.run(
      `INSERT OR REPLACE INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(ph.offer_id || ''),
        productId,
        String(ph.store_id || 'trendyol'),
        Number(ph.price || 0),
        ph.old_price !== null && ph.old_price !== undefined ? Number(ph.old_price) : null,
        String(ph.currency || 'TRY'),
        String(ph.availability || 'Stokta'),
        ph.is_suspicious ? 1 : 0,
        String(ph.checked_at || new Date().toISOString()),
      ]
    );
  }

  persistDb(db);
  await addSystemLog('INFO', 'SYSTEM', `Yedek geri yüklendi: ${importedProducts} ürün eklendi.`, {
    importedProducts,
    skippedProducts,
  });

  return { importedProducts, skippedProducts };
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  db.run(`DELETE FROM price_history`);
  db.run(`DELETE FROM offers`);
  db.run(`DELETE FROM notifications`);
  db.run(`DELETE FROM products`);
  db.run(`UPDATE stores SET status = 'unknown', last_successful_check = NULL, last_checked_at = NULL, last_error = NULL`);
  persistDb(db);
  await addSystemLog('WARN', 'SYSTEM', 'Tüm takip edilen ürün ve fiyat geçmişi verileri kullanıcı tarafından temizlendi.');
}
