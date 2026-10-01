// server.ts
import "dotenv/config";
import fs3 from "fs";
import path3 from "path";
import express from "express";

// src/server/database.ts
import fs2 from "fs";
import path2 from "path";
import initSqlJs from "sql.js";

// src/server/cryptoVault.ts
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
function getDataDir() {
  if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim()) {
    return path.dirname(path.resolve(process.env.DATABASE_PATH.trim()));
  }
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }
  return path.resolve(process.cwd(), "data");
}
function getOrCreateMasterKey() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.trim()) {
    return crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY.trim()).digest();
  }
  const dataDir = getDataDir();
  const keyFile = path.join(dataDir, ".vault.key");
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, "utf8").trim();
      if (hex.length === 64) {
        return Buffer.from(hex, "hex");
      }
    }
    const randomKey = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, randomKey.toString("hex"), { mode: 384 });
    return randomKey;
  } catch {
    const seed = `${os.hostname()}-${os.userInfo().username}-fiyat-takip-agent-v1`;
    return crypto.createHash("sha256").update(seed).digest();
  }
}
function encryptSecret(plainText) {
  if (!plainText) return "";
  const key = getOrCreateMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptSecret(cipherText) {
  if (!cipherText || !cipherText.includes(":")) return "";
  try {
    const [ivHex, tagHex, dataHex] = cipherText.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";
    const key = getOrCreateMasterKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}
function maskSecret(secret) {
  if (!secret) return "";
  if (secret.length <= 8) return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  return `${secret.slice(0, 4)}\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${secret.slice(-4)}`;
}

// src/server/database.ts
function getDatabasePath() {
  if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim()) {
    return path2.resolve(process.env.DATABASE_PATH.trim());
  }
  const dataDir = process.env.DATA_DIR && process.env.DATA_DIR.trim() ? path2.resolve(process.env.DATA_DIR.trim()) : path2.resolve(process.cwd(), "data");
  return path2.join(dataDir, "fiyat_takip.sqlite");
}
var DB_PATH = getDatabasePath();
var DATA_DIR = path2.dirname(DB_PATH);
var INITIAL_TURKISH_STORES = [
  { id: "trendyol", name: "Trendyol", domain: "trendyol.com" },
  { id: "hepsiburada", name: "Hepsiburada", domain: "hepsiburada.com" },
  { id: "amazon_tr", name: "Amazon T\xFCrkiye", domain: "amazon.com.tr" },
  { id: "n11", name: "N11", domain: "n11.com" },
  { id: "ciceksepeti", name: "\xC7i\xE7ekSepeti", domain: "ciceksepeti.com" },
  { id: "mediamarkt", name: "MediaMarkt T\xFCrkiye", domain: "mediamarkt.com.tr" },
  { id: "teknosa", name: "Teknosa", domain: "teknosa.com" },
  { id: "vatan", name: "Vatan Bilgisayar", domain: "vatanbilgisayar.com" },
  { id: "pazarama", name: "Pazarama", domain: "pazarama.com" },
  { id: "akakce", name: "Akak\xE7e", domain: "akakce.com" },
  { id: "cimri", name: "Cimri", domain: "cimri.com" }
];
var DEFAULT_USER_SETTINGS = {
  theme: "dark",
  language: "tr",
  runInBackground: true,
  launchAtStartup: false,
  firstRunCompleted: false,
  devModeEnabled: false,
  checkFrequency: "daily_1",
  preferredCheckTime: "09:00",
  dropRuleType: "any",
  minDropPercent: 5,
  minDropAmount: 500,
  notifyOnTargetReached: true,
  notifyOnRestock: true,
  notifyOnPriceIncrease: false,
  macosNotificationsEnabled: true,
  emailNotificationsEnabled: false,
  emailRecipient: "",
  emailSmtpHost: "smtp.gmail.com",
  emailSmtpPort: 587,
  emailSmtpUser: "",
  emailSmtpPasswordSet: false,
  telegramNotificationsEnabled: false,
  telegramBotTokenSet: false,
  telegramBotTokenMasked: "",
  telegramChatId: ""
};
var dbInstance = null;
var initPromise = null;
async function getDb() {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const dbFilePath = getDatabasePath();
    const dbDir = path2.dirname(dbFilePath);
    if (!fs2.existsSync(dbDir)) {
      fs2.mkdirSync(dbDir, { recursive: true });
    }
    const SQL = await initSqlJs();
    let db;
    if (fs2.existsSync(dbFilePath)) {
      const fileBuffer = fs2.readFileSync(dbFilePath);
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
function persistDb(db = dbInstance) {
  if (!db) return;
  try {
    const dbFilePath = getDatabasePath();
    const dbDir = path2.dirname(dbFilePath);
    if (!fs2.existsSync(dbDir)) {
      fs2.mkdirSync(dbDir, { recursive: true });
    }
    const data = db.export();
    const tempPath = `${dbFilePath}.tmp`;
    fs2.writeFileSync(tempPath, Buffer.from(data));
    fs2.renameSync(tempPath, dbFilePath);
  } catch (err) {
    console.error("Failed to persist SQLite database:", err);
  }
}
function initializeSchema(db) {
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
      match_confidence TEXT DEFAULT 'Kesin e\u015Fle\u015Fme',
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
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO stores (id, name, domain, enabled, status, last_successful_check, last_checked_at, last_error)
    VALUES (?, ?, ?, 1, 'unknown', NULL, NULL, NULL)
  `);
  for (const s of INITIAL_TURKISH_STORES) {
    stmt.run([s.id, s.name, s.domain]);
  }
  stmt.free();
}
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}
function queryOne(db, sql, params = []) {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}
async function addSystemLog(level, category, message, details = "") {
  const db = await getDb();
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const detailsStr = typeof details === "string" ? details : JSON.stringify(details);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.run(
    `INSERT INTO system_logs (id, level, category, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, level, category, message, detailsStr, now]
  );
  db.run(`
    DELETE FROM system_logs WHERE id NOT IN (
      SELECT id FROM system_logs ORDER BY created_at DESC LIMIT 500
    )
  `);
  persistDb(db);
}
async function getSystemLogs(limit = 200, category) {
  const db = await getDb();
  if (category && category !== "ALL") {
    return queryAll(
      db,
      `SELECT * FROM system_logs WHERE category = ? ORDER BY created_at DESC LIMIT ?`,
      [category, limit]
    );
  }
  return queryAll(
    db,
    `SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?`,
    [limit]
  );
}
async function clearSystemLogs() {
  const db = await getDb();
  db.run(`DELETE FROM system_logs`);
  persistDb(db);
}
async function getUserSettings() {
  const db = await getDb();
  const rows = queryAll(db, `SELECT key, value FROM user_settings`);
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    map.set(r.key, r.value);
  }
  const getBool = (k, def) => map.has(k) ? map.get(k) === "true" : def;
  const getNum = (k, def) => map.has(k) ? Number(map.get(k)) || def : def;
  const getStr = (k, def) => map.has(k) ? map.get(k) : def;
  const decryptedTelegramToken = decryptSecret(map.get("telegramBotTokenEncrypted") || "") || (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const decryptedSmtpPassword = decryptSecret(map.get("emailSmtpPasswordEncrypted") || "") || (process.env.SMTP_PASS || "").trim();
  const envTelegramChatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  const envEmailRecipient = (process.env.NOTIFICATION_EMAIL_TO || "").trim();
  const envSmtpHost = (process.env.SMTP_HOST || "").trim();
  const envSmtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 0;
  const envSmtpUser = (process.env.SMTP_USER || "").trim();
  return {
    theme: getStr("theme", DEFAULT_USER_SETTINGS.theme),
    language: "tr",
    runInBackground: getBool("runInBackground", DEFAULT_USER_SETTINGS.runInBackground),
    launchAtStartup: getBool("launchAtStartup", DEFAULT_USER_SETTINGS.launchAtStartup),
    firstRunCompleted: getBool("firstRunCompleted", DEFAULT_USER_SETTINGS.firstRunCompleted),
    devModeEnabled: getBool("devModeEnabled", DEFAULT_USER_SETTINGS.devModeEnabled),
    checkFrequency: getStr("checkFrequency", DEFAULT_USER_SETTINGS.checkFrequency),
    preferredCheckTime: getStr("preferredCheckTime", DEFAULT_USER_SETTINGS.preferredCheckTime),
    dropRuleType: getStr("dropRuleType", DEFAULT_USER_SETTINGS.dropRuleType),
    minDropPercent: getNum("minDropPercent", DEFAULT_USER_SETTINGS.minDropPercent),
    minDropAmount: getNum("minDropAmount", DEFAULT_USER_SETTINGS.minDropAmount),
    notifyOnTargetReached: getBool("notifyOnTargetReached", DEFAULT_USER_SETTINGS.notifyOnTargetReached),
    notifyOnRestock: getBool("notifyOnRestock", DEFAULT_USER_SETTINGS.notifyOnRestock),
    notifyOnPriceIncrease: getBool("notifyOnPriceIncrease", DEFAULT_USER_SETTINGS.notifyOnPriceIncrease),
    macosNotificationsEnabled: getBool("macosNotificationsEnabled", DEFAULT_USER_SETTINGS.macosNotificationsEnabled),
    emailNotificationsEnabled: getBool(
      "emailNotificationsEnabled",
      Boolean(envEmailRecipient && decryptedSmtpPassword) || DEFAULT_USER_SETTINGS.emailNotificationsEnabled
    ),
    emailRecipient: getStr("emailRecipient", envEmailRecipient || DEFAULT_USER_SETTINGS.emailRecipient),
    emailSmtpHost: getStr("emailSmtpHost", envSmtpHost || DEFAULT_USER_SETTINGS.emailSmtpHost),
    emailSmtpPort: getNum("emailSmtpPort", envSmtpPort || DEFAULT_USER_SETTINGS.emailSmtpPort),
    emailSmtpUser: getStr("emailSmtpUser", envSmtpUser || DEFAULT_USER_SETTINGS.emailSmtpUser),
    emailSmtpPasswordSet: Boolean(decryptedSmtpPassword),
    telegramNotificationsEnabled: getBool(
      "telegramNotificationsEnabled",
      Boolean(decryptedTelegramToken && envTelegramChatId) || DEFAULT_USER_SETTINGS.telegramNotificationsEnabled
    ),
    telegramBotTokenSet: Boolean(decryptedTelegramToken),
    telegramBotTokenMasked: maskSecret(decryptedTelegramToken),
    telegramChatId: getStr("telegramChatId", envTelegramChatId || DEFAULT_USER_SETTINGS.telegramChatId)
  };
}
async function getDecryptedCredentials() {
  const db = await getDb();
  const tgRow = queryOne(
    db,
    `SELECT value FROM user_settings WHERE key = 'telegramBotTokenEncrypted'`
  );
  const smtpRow = queryOne(
    db,
    `SELECT value FROM user_settings WHERE key = 'emailSmtpPasswordEncrypted'`
  );
  return {
    telegramBotToken: decryptSecret(tgRow?.value || "") || (process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    emailSmtpPassword: decryptSecret(smtpRow?.value || "") || (process.env.SMTP_PASS || "").trim()
  };
}
async function updateUserSettings(updates) {
  const db = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const upsert = (key, val) => {
    db.run(
      `INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, val, now]
    );
  };
  const allowedKeys = [
    "theme",
    "runInBackground",
    "launchAtStartup",
    "firstRunCompleted",
    "devModeEnabled",
    "checkFrequency",
    "preferredCheckTime",
    "dropRuleType",
    "minDropPercent",
    "minDropAmount",
    "notifyOnTargetReached",
    "notifyOnRestock",
    "notifyOnPriceIncrease",
    "macosNotificationsEnabled",
    "emailNotificationsEnabled",
    "emailRecipient",
    "emailSmtpHost",
    "emailSmtpPort",
    "emailSmtpUser",
    "telegramNotificationsEnabled",
    "telegramChatId"
  ];
  for (const key of allowedKeys) {
    if (updates[key] !== void 0) {
      upsert(key, String(updates[key]));
    }
  }
  if (updates.telegramBotToken !== void 0) {
    const trimmed = updates.telegramBotToken.trim();
    upsert("telegramBotTokenEncrypted", trimmed ? encryptSecret(trimmed) : "");
  }
  if (updates.emailSmtpPassword !== void 0) {
    const trimmed = updates.emailSmtpPassword.trim();
    upsert("emailSmtpPasswordEncrypted", trimmed ? encryptSecret(trimmed) : "");
  }
  persistDb(db);
  return getUserSettings();
}
async function getAllStores() {
  const db = await getDb();
  const stores = queryAll(db, `SELECT * FROM stores ORDER BY name ASC`);
  const counts = queryAll(
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
    tracked_offers_count: countMap.get(s.id) || 0
  }));
}
async function updateStoreStatus(params) {
  const db = await getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (params.enabled !== void 0) {
    db.run(`UPDATE stores SET enabled = ? WHERE id = ?`, [params.enabled ? 1 : 0, params.storeId]);
  }
  if (params.status === "operational") {
    db.run(
      `UPDATE stores SET status = 'operational', last_successful_check = ?, last_checked_at = ?, last_error = NULL WHERE id = ?`,
      [now, now, params.storeId]
    );
  } else if (params.status === "unavailable") {
    db.run(
      `UPDATE stores SET status = 'unavailable', last_checked_at = ?, last_error = ? WHERE id = ?`,
      [now, params.error || "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.", params.storeId]
    );
  }
  persistDb(db);
}
async function getAllProducts() {
  const db = await getDb();
  const rawProducts = queryAll(db, `SELECT * FROM products ORDER BY created_at DESC`);
  const allOffers = await getAllOffers();
  const offersByProduct = /* @__PURE__ */ new Map();
  for (const offer of allOffers) {
    const list = offersByProduct.get(offer.product_id) || [];
    list.push(offer);
    offersByProduct.set(offer.product_id, list);
  }
  const historyRows = queryAll(
    db,
    `SELECT product_id, price, checked_at FROM price_history WHERE is_suspicious = 0 ORDER BY checked_at ASC`
  );
  const firstPriceMap = /* @__PURE__ */ new Map();
  for (const h of historyRows) {
    if (!firstPriceMap.has(h.product_id) && h.price > 0) {
      firstPriceMap.set(h.product_id, h.price);
    }
  }
  return rawProducts.map((p) => {
    const productOffers = offersByProduct.get(p.id) || [];
    const eligibleOffers = productOffers.filter(
      (o) => (o.match_confidence === "Kesin e\u015Fle\u015Fme" || o.match_confidence === "Y\xFCksek e\u015Fle\u015Fme") && o.price !== null && o.price > 0 && o.price_status !== "suspicious"
    );
    eligibleOffers.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    const lowestOffer = eligibleOffers[0] || null;
    const currentLowestPrice = lowestOffer ? lowestOffer.price : null;
    const currentLowestStore = lowestOffer ? lowestOffer.store_name : null;
    let previousLowestPrice = null;
    if (lowestOffer && lowestOffer.previous_price && lowestOffer.previous_price > 0) {
      previousLowestPrice = lowestOffer.previous_price;
    } else if (firstPriceMap.has(p.id)) {
      previousLowestPrice = firstPriceMap.get(p.id) || null;
    }
    let priceChangeAmount = null;
    let priceChangePercent = null;
    if (currentLowestPrice !== null && previousLowestPrice !== null && previousLowestPrice > 0) {
      priceChangeAmount = Math.round((currentLowestPrice - previousLowestPrice) * 100) / 100;
      priceChangePercent = Math.round((currentLowestPrice - previousLowestPrice) / previousLowestPrice * 1e4) / 100;
    }
    const checkedTimestamps = productOffers.map((o) => o.checked_at).filter((t) => Boolean(t)).sort().reverse();
    const lastCheckedAt = checkedTimestamps[0] || null;
    const anyInStock = productOffers.some((o) => o.availability === "Stokta");
    const allOut = productOffers.length > 0 && productOffers.every((o) => o.availability === "T\xFCkendi");
    const availabilitySummary = anyInStock ? "Stokta" : allOut ? "T\xFCkendi" : "Bilinmiyor";
    const hasSuspiciousPrice = productOffers.some((o) => o.price_status === "suspicious");
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
      currency: p.currency || "TRY",
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
      offers: productOffers
    };
  });
}
async function getProductById(productId) {
  const all = await getAllProducts();
  return all.find((p) => p.id === productId) || null;
}
async function getAllOffers() {
  const db = await getDb();
  return queryAll(
    db,
    `SELECT o.*, s.name as store_name, s.domain as store_domain
     FROM offers o
     LEFT JOIN stores s ON o.store_id = s.id
     ORDER BY CASE WHEN o.price IS NULL THEN 1 ELSE 0 END, o.price ASC`
  );
}
async function createProductWithOffers(params) {
  const db = await getDb();
  const productId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
      now
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
        o.seller || "",
        o.price,
        o.currency || "TRY",
        o.availability,
        o.matchConfidence,
        o.matchScore,
        o.matchTitle || params.name,
        o.priceStatus,
        now,
        o.lastError || null
      ]
    );
    if (o.price !== null && o.price > 0) {
      const histId = `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      db.run(
        `INSERT INTO price_history (
          id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0, ?)`,
        [histId, offerId, productId, o.storeId, o.price, o.currency || "TRY", o.availability, now]
      );
    }
  }
  await updateUserSettings({ firstRunCompleted: true });
  persistDb(db);
  await addSystemLog("INFO", "SYSTEM", `Yeni \xFCr\xFCn takibe eklendi: ${params.name}`, {
    productId,
    offersCount: params.offers.length
  });
  const created = await getProductById(productId);
  if (!created) {
    throw new Error("\xDCr\xFCn kaydedildikten sonra okunamad\u0131.");
  }
  return created;
}
async function updateProductSettings(productId, updates) {
  const db = await getDb();
  if (updates.targetPrice !== void 0) {
    db.run(`UPDATE products SET target_price = ? WHERE id = ?`, [updates.targetPrice, productId]);
  }
  if (updates.active !== void 0) {
    db.run(`UPDATE products SET active = ? WHERE id = ?`, [updates.active ? 1 : 0, productId]);
  }
  if (updates.name !== void 0 && updates.name.trim()) {
    db.run(`UPDATE products SET name = ? WHERE id = ?`, [updates.name.trim(), productId]);
  }
  persistDb(db);
  return getProductById(productId);
}
async function deleteProduct(productId) {
  const db = await getDb();
  db.run(`DELETE FROM price_history WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM offers WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM notifications WHERE product_id = ?`, [productId]);
  db.run(`DELETE FROM products WHERE id = ?`, [productId]);
  persistDb(db);
}
async function getProductPriceHistory(productId, days) {
  const db = await getDb();
  let sql = `
    SELECT ph.*, s.name as store_name
    FROM price_history ph
    LEFT JOIN stores s ON ph.store_id = s.id
    WHERE ph.product_id = ? AND ph.is_suspicious = 0
  `;
  const params = [productId];
  if (days && days > 0) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
    sql += ` AND ph.checked_at >= ?`;
    params.push(cutoff);
  }
  sql += ` ORDER BY ph.checked_at ASC`;
  return queryAll(db, sql, params);
}
async function getAllPriceDrops() {
  const db = await getDb();
  const rows = queryAll(
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
    const dropPercent = Math.round((r.old_price - r.price) / r.old_price * 1e4) / 100;
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
      currency: r.currency || "TRY",
      checked_at: r.checked_at,
      product_url: r.url || ""
    };
  });
}
async function getAllNotifications() {
  const db = await getDb();
  return queryAll(
    db,
    `SELECT n.*, p.name as product_name, p.image as product_image
     FROM notifications n
     LEFT JOIN products p ON n.product_id = p.id
     ORDER BY n.created_at DESC
     LIMIT 200`
  );
}
async function hasNotificationWithDedupKey(dedupKey) {
  if (!dedupKey) return false;
  const db = await getDb();
  const row = queryOne(
    db,
    `SELECT id FROM notifications WHERE dedup_key = ? LIMIT 1`,
    [dedupKey]
  );
  return Boolean(row);
}
async function insertNotificationRecord(params) {
  const db = await getDb();
  if (params.dedupKey && await hasNotificationWithDedupKey(params.dedupKey)) {
    await addSystemLog(
      "DEBUG",
      "NOTIFICATION",
      `M\xFCkerrer bildirim engellendi (${params.dedupKey})`,
      params.title
    );
    return null;
  }
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
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
      params.currency || "TRY",
      params.productUrl,
      now,
      params.dedupKey
    ]
  );
  persistDb(db);
  return queryOne(
    db,
    `SELECT n.*, p.name as product_name, p.image as product_image
     FROM notifications n
     LEFT JOIN products p ON n.product_id = p.id
     WHERE n.id = ?`,
    [id]
  );
}
async function markNotificationsRead(notificationId) {
  const db = await getDb();
  if (notificationId) {
    db.run(`UPDATE notifications SET read = 1 WHERE id = ?`, [notificationId]);
  } else {
    db.run(`UPDATE notifications SET read = 1`);
  }
  persistDb(db);
}
async function resolveSuspiciousOfferPrice(offerId, action) {
  const db = await getDb();
  const offer = queryOne(db, `SELECT * FROM offers WHERE id = ?`, [offerId]);
  if (!offer || offer.suspicious_price === null) return;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (action === "approve") {
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
    await addSystemLog("INFO", "PRICE_CHECK", `\u015E\xFCpheli fiyat kullan\u0131c\u0131 taraf\u0131ndan onayland\u0131: ${newPrice} TL`, { offerId });
  } else {
    db.run(
      `UPDATE offers
       SET price_status = 'last_known', suspicious_price = NULL, suspicious_reason = NULL
       WHERE id = ?`,
      [offerId]
    );
    await addSystemLog("INFO", "PRICE_CHECK", `\u015E\xFCpheli fiyat kullan\u0131c\u0131 taraf\u0131ndan reddedildi.`, { offerId });
  }
  persistDb(db);
}
async function exportDatabaseBackup() {
  const db = await getDb();
  const products = queryAll(db, `SELECT * FROM products`);
  const offers = queryAll(db, `SELECT * FROM offers`);
  const priceHistory = queryAll(db, `SELECT * FROM price_history`);
  const settings = await getUserSettings();
  return {
    version: "1.0.0",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    app: "Fiyat Takip Agent",
    products,
    offers,
    priceHistory,
    settings
  };
}
async function importDatabaseBackup(backupData, overwriteExisting = false) {
  const db = await getDb();
  const products = Array.isArray(backupData.products) ? backupData.products : [];
  const offers = Array.isArray(backupData.offers) ? backupData.offers : [];
  const priceHistory = Array.isArray(backupData.priceHistory) ? backupData.priceHistory : [];
  let importedProducts = 0;
  let skippedProducts = 0;
  for (const p of products) {
    const id = String(p.id || "");
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
        String(p.brand || ""),
        String(p.model || ""),
        String(p.product_code || ""),
        String(p.ean || ""),
        String(p.image || ""),
        String(p.original_url),
        p.target_price !== null && p.target_price !== void 0 ? Number(p.target_price) : null,
        String(p.currency || "TRY"),
        String(p.storage || ""),
        String(p.ram || ""),
        String(p.color || ""),
        String(p.size || ""),
        String(p.generation || ""),
        String(p.created_at || (/* @__PURE__ */ new Date()).toISOString()),
        p.active === 0 ? 0 : 1
      ]
    );
    importedProducts++;
  }
  for (const o of offers) {
    const id = String(o.id || "");
    const productId = String(o.product_id || "");
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
        String(o.store_id || "trendyol"),
        String(o.url || ""),
        String(o.seller || ""),
        o.price !== null && o.price !== void 0 ? Number(o.price) : null,
        o.previous_price !== null && o.previous_price !== void 0 ? Number(o.previous_price) : null,
        String(o.currency || "TRY"),
        String(o.availability || "Bilinmiyor"),
        String(o.match_confidence || "Kesin e\u015Fle\u015Fme"),
        Number(o.match_score ?? 100),
        String(o.match_title || ""),
        String(o.price_status || "verified"),
        o.suspicious_price !== null && o.suspicious_price !== void 0 ? Number(o.suspicious_price) : null,
        o.suspicious_reason ? String(o.suspicious_reason) : null,
        o.checked_at ? String(o.checked_at) : null,
        o.last_error ? String(o.last_error) : null
      ]
    );
  }
  for (const ph of priceHistory) {
    const id = String(ph.id || "");
    const productId = String(ph.product_id || "");
    if (!id || !productId) continue;
    const prodExists = queryOne(db, `SELECT id FROM products WHERE id = ?`, [productId]);
    if (!prodExists) continue;
    db.run(
      `INSERT OR REPLACE INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(ph.offer_id || ""),
        productId,
        String(ph.store_id || "trendyol"),
        Number(ph.price || 0),
        ph.old_price !== null && ph.old_price !== void 0 ? Number(ph.old_price) : null,
        String(ph.currency || "TRY"),
        String(ph.availability || "Stokta"),
        ph.is_suspicious ? 1 : 0,
        String(ph.checked_at || (/* @__PURE__ */ new Date()).toISOString())
      ]
    );
  }
  persistDb(db);
  await addSystemLog("INFO", "SYSTEM", `Yedek geri y\xFCklendi: ${importedProducts} \xFCr\xFCn eklendi.`, {
    importedProducts,
    skippedProducts
  });
  return { importedProducts, skippedProducts };
}
async function clearAllData() {
  const db = await getDb();
  db.run(`DELETE FROM price_history`);
  db.run(`DELETE FROM offers`);
  db.run(`DELETE FROM notifications`);
  db.run(`DELETE FROM products`);
  db.run(`UPDATE stores SET status = 'unknown', last_successful_check = NULL, last_checked_at = NULL, last_error = NULL`);
  persistDb(db);
  await addSystemLog("WARN", "SYSTEM", "T\xFCm takip edilen \xFCr\xFCn ve fiyat ge\xE7mi\u015Fi verileri kullan\u0131c\u0131 taraf\u0131ndan temizlendi.");
}

// src/shared/priceUtils.ts
function parsePriceTR(input, defaultCurrency = "TRY") {
  if (input === null || input === void 0) {
    return { amount: null, currency: defaultCurrency, raw: "", isValid: false };
  }
  if (typeof input === "number") {
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
  const match = raw.match(/(\d[\d.,\s]*\d|\d)/);
  if (!match) {
    return { amount: null, currency, raw, isValid: false };
  }
  const token = match[1].replace(/\s+/g, "");
  let normalizedNumberStr = token;
  const hasDot = token.includes(".");
  const hasComma = token.includes(",");
  if (hasDot && hasComma) {
    const lastDotIdx = token.lastIndexOf(".");
    const lastCommaIdx = token.lastIndexOf(",");
    if (lastCommaIdx > lastDotIdx) {
      normalizedNumberStr = token.replace(/\./g, "").replace(",", ".");
    } else {
      normalizedNumberStr = token.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = token.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      normalizedNumberStr = token.replace(",", ".");
    } else if (parts.length === 2 && parts[1].length === 3 && (currency === "USD" || currency === "GBP")) {
      normalizedNumberStr = token.replace(/,/g, "");
    } else if (parts.length > 2) {
      normalizedNumberStr = token.replace(/,/g, "");
    } else {
      normalizedNumberStr = token.replace(",", ".");
    }
  } else if (hasDot && !hasComma) {
    const parts = token.split(".");
    if (parts.length > 2) {
      normalizedNumberStr = token.replace(/\./g, "");
    } else if (parts.length === 2) {
      const fractionalLen = parts[1].length;
      if (fractionalLen === 3) {
        normalizedNumberStr = token.replace(/\./g, "");
      } else {
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
    isValid: true
  };
}
function detectCurrency(input, fallback = "TRY") {
  const upper = input.toUpperCase();
  if (upper.includes("\u20BA") || upper.includes("TL") || upper.includes("TRY")) {
    return "TRY";
  }
  if (upper.includes("$") || upper.includes("USD")) {
    return "USD";
  }
  if (upper.includes("\u20AC") || upper.includes("EUR")) {
    return "EUR";
  }
  if (upper.includes("\xA3") || upper.includes("GBP")) {
    return "GBP";
  }
  return fallback;
}
function formatPriceTR(amount, currency = "TRY", forceDecimals = true) {
  if (amount === null || amount === void 0 || !Number.isFinite(amount)) {
    return "\u2014";
  }
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const minFractionDigits = forceDecimals || hasCents ? 2 : 0;
  const maxFractionDigits = 2;
  const formattedNum = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits
  }).format(amount);
  switch (currency) {
    case "TRY":
      return `${formattedNum} TL`;
    case "USD":
      return `${formattedNum} $`;
    case "EUR":
      return `${formattedNum} \u20AC`;
    case "GBP":
      return `${formattedNum} \xA3`;
    default:
      return `${formattedNum} TL`;
  }
}
function isTargetPriceReached(currentPrice, targetPrice) {
  if (currentPrice === null || currentPrice === void 0 || targetPrice === null || targetPrice === void 0 || currentPrice <= 0 || targetPrice <= 0) {
    return false;
  }
  return currentPrice <= targetPrice;
}
function shouldTriggerPriceDropNotification(params) {
  const { oldPrice, newPrice, ruleType, minDropPercent, minDropAmount } = params;
  if (oldPrice <= 0 || newPrice <= 0 || newPrice >= oldPrice) {
    return false;
  }
  const dropAmount = oldPrice - newPrice;
  const dropPercent = (oldPrice - newPrice) / oldPrice * 100;
  switch (ruleType) {
    case "any":
      return dropAmount > 0;
    case "percent":
      return dropPercent >= minDropPercent;
    case "amount":
      return dropAmount >= minDropAmount;
    case "both":
      return dropPercent >= minDropPercent && dropAmount >= minDropAmount;
    default:
      return dropAmount > 0;
  }
}
function validatePriceData(params) {
  const {
    newPrice,
    referencePrice,
    currency = "TRY",
    isProductPage = true,
    isBundleMismatch = false
  } = params;
  if (newPrice === null || newPrice === void 0 || typeof newPrice !== "number" || !Number.isFinite(newPrice)) {
    return { isValid: false, isSuspicious: false, reason: "Ge\xE7ersiz say\u0131sal fiyat de\u011Feri." };
  }
  if (newPrice <= 0) {
    return { isValid: false, isSuspicious: false, reason: "Fiyat s\u0131f\u0131r veya negatif olamaz." };
  }
  if (!["TRY", "USD", "EUR", "GBP"].includes(currency)) {
    return { isValid: false, isSuspicious: false, reason: "Bilinmeyen para birimi." };
  }
  if (!isProductPage) {
    return { isValid: false, isSuspicious: false, reason: "Sayfa ge\xE7erli bir \xFCr\xFCn sayfas\u0131 olarak do\u011Frulanamad\u0131." };
  }
  if (isBundleMismatch) {
    return { isValid: false, isSuspicious: true, reason: "Paket veya aksesuar uyu\u015Fmazl\u0131\u011F\u0131 tespit edildi." };
  }
  if (referencePrice && referencePrice > 100) {
    const ratio = newPrice / referencePrice;
    if (ratio < 0.22) {
      return {
        isValid: true,
        isSuspicious: true,
        reason: `\u015E\xFCpheli fiyat: \xD6nceki fiyat (${formatPriceTR(referencePrice, currency)}) ile yeni alg\u0131lanan fiyat (${formatPriceTR(newPrice, currency)}) aras\u0131nda ola\u011Fand\u0131\u015F\u0131 fark (%${Math.round((1 - ratio) * 100)} d\xFC\u015F\xFC\u015F) var. Do\u011Frulama gerekiyor.`
      };
    }
    if (ratio > 6) {
      return {
        isValid: true,
        isSuspicious: true,
        reason: `\u015E\xFCpheli fiyat: Yeni alg\u0131lanan fiyat \xF6nceki fiyat\u0131n 6 kat\u0131ndan fazla.`
      };
    }
  }
  return { isValid: true, isSuspicious: false };
}
var TRACKING_PARAMS = /* @__PURE__ */ new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "yclid",
  "msclkid",
  "twclid",
  "ttclid",
  "ref",
  "ref_",
  "tag",
  "linkCode",
  "camp",
  "creative",
  "aff_id",
  "affiliate",
  "adjust_t",
  "adjust_campaign",
  "adjust_adgroup",
  "adjust_creative",
  "boutiqueId",
  "merchantId",
  "v",
  "spm",
  "scm"
]);
function normalizeProductUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, normalizedUrl: "", domain: "", error: "L\xFCtfen ge\xE7erli bir \xFCr\xFCn ba\u011Flant\u0131s\u0131 girin." };
  }
  let trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    const embeddedUrlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (embeddedUrlMatch) {
      trimmed = embeddedUrlMatch[0];
    }
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      normalizedUrl: "",
      domain: "",
      error: "Girilen ba\u011Flant\u0131 format\u0131 ge\xE7ersiz. Ba\u011Flant\u0131n\u0131n https:// ile ba\u015Flad\u0131\u011F\u0131ndan emin olun."
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      isValid: false,
      normalizedUrl: "",
      domain: "",
      error: "Sadece HTTP ve HTTPS protokol\xFCne sahip \xFCr\xFCn ba\u011Flant\u0131lar\u0131 desteklenmektedir."
    };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname.startsWith("192.168.") || hostname.startsWith("10.") || hostname.endsWith(".local") || !hostname.includes(".")) {
    return {
      isValid: false,
      normalizedUrl: "",
      domain: "",
      error: "Yerel a\u011F veya ge\xE7ersiz alan ad\u0131 ba\u011Flant\u0131lar\u0131 g\xFCvenlik nedeniyle kabul edilmez."
    };
  }
  const keysToDelete = [];
  parsed.searchParams.forEach((_, key) => {
    if (TRACKING_PARAMS.has(key) || key.toLowerCase().startsWith("utm_")) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((k) => parsed.searchParams.delete(k));
  parsed.hash = "";
  const domain = hostname.replace(/^www\./, "");
  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
    domain
  };
}

// src/server/notificationService.ts
async function dispatchNotification(input) {
  const settings = await getUserSettings();
  const currency = input.currency || "TRY";
  let dropAmount = null;
  let dropPercent = null;
  if (input.oldPrice !== null && input.newPrice !== null && input.oldPrice > 0 && input.newPrice > 0) {
    dropAmount = Math.round((input.oldPrice - input.newPrice) * 100) / 100;
    dropPercent = Math.round((input.oldPrice - input.newPrice) / input.oldPrice * 1e4) / 100;
  }
  let title = input.customTitle || "Fiyat D\xFC\u015Ft\xFC!";
  let message = input.customMessage || "";
  if (!input.customTitle || !input.customMessage) {
    switch (input.type) {
      case "target_reached":
        title = "\u{1F3AF} Hedef fiyat\u0131n\u0131za ula\u015F\u0131ld\u0131!";
        message = `${input.productName} \u2014 ${formatPriceTR(input.newPrice, currency, false)} (${input.storeName})`;
        break;
      case "price_drop":
      case "new_lowest_store": {
        title = input.type === "new_lowest_store" ? "Yeni En D\xFC\u015F\xFCk Ma\u011Faza Fiyat\u0131!" : "Fiyat D\xFC\u015Ft\xFC!";
        const absDrop = dropAmount ? formatPriceTR(Math.abs(dropAmount), currency, false) : "";
        const absPct = dropPercent ? `%${Math.abs(dropPercent).toLocaleString("tr-TR")}` : "";
        message = `${input.productName}
${formatPriceTR(input.oldPrice, currency, false)} \u2192 ${formatPriceTR(input.newPrice, currency, false)}
D\xFC\u015F\xFC\u015F: ${absDrop} (${absPct}) \xB7 Ma\u011Faza: ${input.storeName}`;
        break;
      }
      case "restock":
        title = "\xDCr\xFCn Tekrar Stokta!";
        message = `${input.productName} yeniden stoklara girdi (${formatPriceTR(input.newPrice, currency, false)} \u2014 ${input.storeName}).`;
        break;
      case "price_increase":
        title = "Fiyat Art\u0131\u015F\u0131 Tespit Edildi";
        message = `${input.productName}: ${formatPriceTR(input.oldPrice, currency, false)} \u2192 ${formatPriceTR(input.newPrice, currency, false)} (${input.storeName})`;
        break;
      case "test":
        title = input.customTitle || "Fiyat Takip Agent \u2014 Test Bildirimi";
        message = input.customMessage || "Fiyat D\xFC\u015Ft\xFC! Sony WH-1000XM5 \xB7 10.499 TL \u2192 9.249 TL \xB7 D\xFC\u015F\xFC\u015F: 1.250 TL (%11,91) \xB7 Ma\u011Faza: Trendyol";
        break;
    }
  }
  const dedupKey = input.bypassDeduplication ? "" : `${input.productId || "sys"}:${input.storeId || "any"}:${input.type}:${input.newPrice ?? "na"}`;
  const record = await insertNotificationRecord({
    productId: input.productId,
    storeId: input.storeId,
    storeName: input.storeName,
    type: input.type,
    title,
    message,
    oldPrice: input.oldPrice,
    newPrice: input.newPrice,
    dropAmount,
    dropPercent,
    currency,
    productUrl: input.productUrl,
    dedupKey
  });
  if (!record) {
    return {
      created: false,
      notification: null,
      channelsDispatched: [],
      errors: []
    };
  }
  const channelsDispatched = [];
  const errors = [];
  if (settings.macosNotificationsEnabled) {
    if (process.platform === "darwin") {
      try {
        const { execFile } = await import("child_process");
        const safeTitle = title.replace(/["\\]/g, "");
        const safeMsg = message.replace(/\n/g, " \xB7 ").replace(/["\\]/g, "");
        execFile("osascript", [
          "-e",
          `display notification "${safeMsg}" with title "${safeTitle}" sound name "Glass"`
        ]);
        channelsDispatched.push("macOS Masa\xFCst\xFC Bildirimi");
      } catch {
        channelsDispatched.push("Web Taray\u0131c\u0131 Bildirimi");
      }
    } else {
      channelsDispatched.push("Web Taray\u0131c\u0131 Bildirimi");
    }
  }
  if (settings.telegramNotificationsEnabled && settings.telegramChatId) {
    const creds = await getDecryptedCredentials();
    if (creds.telegramBotToken) {
      try {
        const tgText = `\u{1F514} *${title}*

\u{1F4E6} *\xDCr\xFCn:* ${input.productName}
\u{1F3EC} *Ma\u011Faza:* ${input.storeName}
${input.oldPrice && input.newPrice ? `\u{1F4B0} *Fiyat:* ${formatPriceTR(input.oldPrice, currency, false)} \u2192 *${formatPriceTR(input.newPrice, currency, false)}*
` : ""}${dropAmount && dropAmount > 0 ? `\u{1F4C9} *D\xFC\u015F\xFC\u015F:* ${formatPriceTR(dropAmount, currency, false)} (%${dropPercent?.toLocaleString("tr-TR")})
` : ""}${input.productUrl ? `
\u{1F517} [\xDCr\xFCn\xFC A\xE7](${input.productUrl})` : ""}`;
        const tgRes = await fetch(
          `https://api.telegram.org/bot${creds.telegramBotToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: settings.telegramChatId,
              text: tgText,
              parse_mode: "Markdown",
              disable_web_page_preview: false
            })
          }
        );
        if (tgRes.ok) {
          channelsDispatched.push("Telegram");
        } else {
          const errBody = await tgRes.text();
          errors.push(`Telegram bildirimi g\xF6nderilemedi: ${errBody.slice(0, 120)}`);
        }
      } catch (err) {
        errors.push(`Telegram ba\u011Flant\u0131 hatas\u0131: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  if (settings.emailNotificationsEnabled && settings.emailRecipient) {
    channelsDispatched.push(`E-posta (${settings.emailRecipient})`);
    await addSystemLog(
      "INFO",
      "NOTIFICATION",
      `E-posta bildirimi kuyru\u011Fa al\u0131nd\u0131 (${settings.emailRecipient}): ${title}`,
      { recipient: settings.emailRecipient, title }
    );
  }
  await addSystemLog(
    errors.length > 0 ? "WARN" : "INFO",
    "NOTIFICATION",
    `Bildirim olu\u015Fturuldu: ${title} (${input.productName})`,
    { channelsDispatched, errors }
  );
  return {
    created: true,
    notification: record,
    channelsDispatched,
    errors
  };
}

// src/server/priceTrackerService.ts
import dns from "dns/promises";

// src/shared/productMatcher.ts
var KNOWN_BRANDS = [
  "Apple",
  "Samsung",
  "Sony",
  "Xiaomi",
  "Dyson",
  "Asus",
  "Lenovo",
  "HP",
  "Dell",
  "MSI",
  "Monster",
  "Acer",
  "LG",
  "Philips",
  "Bosch",
  "Siemens",
  "Ar\xE7elik",
  "Beko",
  "Vestel",
  "Karaca",
  "Tefal",
  "Delonghi",
  "Nespresso",
  "JBL",
  "Sennheiser",
  "Bose",
  "Anker",
  "Logitech",
  "Razer",
  "SteelSeries",
  "Corsair",
  "Huawei",
  "Honor",
  "Nothing",
  "Garmin",
  "Nintendo",
  "PlayStation",
  "Xbox",
  "Canon",
  "Nikon",
  "Fujifilm",
  "GoPro",
  "DJI"
];
var VARIANT_TIERS = [
  "pro max",
  "ultra",
  "pro",
  "plus",
  "max",
  "mini",
  "slim",
  "air",
  "lite",
  "fe",
  "se",
  "oled",
  "fold",
  "flip"
];
var COLOR_MAP = {
  siyah: "black",
  black: "black",
  midnight: "black",
  "gece yar\u0131s\u0131": "black",
  uzay: "black",
  graphite: "black",
  grafit: "black",
  beyaz: "white",
  white: "white",
  starlight: "white",
  "y\u0131ld\u0131z \u0131\u015F\u0131\u011F\u0131": "white",
  g\u00FCm\u00FC\u015F: "silver",
  silver: "silver",
  gri: "gray",
  gray: "gray",
  grey: "gray",
  mavi: "blue",
  blue: "blue",
  lacivert: "blue",
  ultramarine: "blue",
  ye\u015Fil: "green",
  green: "green",
  pembe: "pink",
  pink: "pink",
  k\u0131rm\u0131z\u0131: "red",
  red: "red",
  mor: "purple",
  purple: "purple",
  sar\u0131: "yellow",
  yellow: "yellow",
  alt\u0131n: "gold",
  gold: "gold",
  "nat\xFCrel titanyum": "natural_titanium",
  "natural titanium": "natural_titanium",
  "\xE7\xF6l titanyum": "desert_titanium",
  "desert titanium": "desert_titanium",
  "beyaz titanyum": "white_titanium",
  "white titanium": "white_titanium",
  "siyah titanyum": "black_titanium",
  "black titanium": "black_titanium",
  krem: "cream",
  bej: "cream"
};
var ACCESSORY_KEYWORDS = [
  "k\u0131l\u0131f",
  "kilif",
  "ekran koruyucu",
  "cam koruyucu",
  "temperli cam",
  "kordon",
  "kay\u0131\u015F",
  "\u015Farj kablosu",
  "adapt\xF6r k\u0131l\u0131f\u0131",
  "sticker",
  "kaplama",
  "stand\u0131",
  "tutucu",
  "case",
  "cover",
  "screen protector",
  "silikon k\u0131l\u0131f"
];
var BUNDLE_KEYWORDS = [
  "paket",
  "seti",
  "bundle",
  "ikili",
  "2'li",
  "3'l\xFC",
  "+ k\u0131l\u0131f",
  "+ \u015Farj"
];
function normalizeTextTR(text) {
  return text.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^\w\s+-]/g, " ").replace(/\s+/g, " ").trim();
}
function extractProductSpecs(title, extra) {
  const lowerTR = title.toLocaleLowerCase("tr-TR");
  const norm = normalizeTextTR(title);
  let brand = extra?.brand?.trim() || "";
  if (!brand) {
    for (const candidate of KNOWN_BRANDS) {
      const candidateNorm = normalizeTextTR(candidate);
      const regex = new RegExp(`\\b${candidateNorm}\\b`, "i");
      if (regex.test(norm)) {
        brand = candidate;
        break;
      }
    }
  }
  if (!brand) {
    const firstWord = title.trim().split(/\s+/)[0] || "";
    if (firstWord.length >= 2) {
      brand = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
    }
  }
  let storage = extra?.storage || "";
  let ram = extra?.ram || "";
  const capMatches = Array.from(norm.matchAll(/\b(\d{1,4})\s*(gb|tb)\b/gi));
  for (const m of capMatches) {
    const val = Number(m[1]);
    const unit = m[2].toUpperCase();
    const formatted = `${val} ${unit}`;
    const afterMatch = norm.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 12);
    if (afterMatch.includes("ram") || afterMatch.includes("bellek")) {
      if (!ram) ram = formatted;
    } else if (unit === "TB" || val >= 64) {
      if (!storage) storage = formatted;
    } else if (val <= 48 && !ram && capMatches.length > 1) {
      ram = formatted;
    } else if (!storage) {
      storage = formatted;
    }
  }
  let color = extra?.color || "";
  if (!color) {
    const sortedColorKeys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedColorKeys) {
      if (lowerTR.includes(key.trim())) {
        color = COLOR_MAP[key];
        break;
      }
    }
  } else {
    const mapped = COLOR_MAP[color.toLocaleLowerCase("tr-TR")];
    if (mapped) color = mapped;
  }
  const detectedTiers = [];
  let normForTier = norm;
  for (const tier of VARIANT_TIERS) {
    const regex = new RegExp(`\\b${tier}\\b`, "i");
    if (regex.test(normForTier)) {
      detectedTiers.push(tier);
      normForTier = normForTier.replace(regex, " ");
    }
  }
  const variantTier = detectedTiers.join(" ");
  let generation = extra?.generation || "";
  let modelNumber = extra?.modelNumber || extra?.productCode || "";
  const alphaNumModelMatches = title.match(/\b([A-Z]{1,4}[-]?[0-9]{2,5}[A-Z0-9-]{0,6})\b/g);
  if (!modelNumber && alphaNumModelMatches && alphaNumModelMatches.length > 0) {
    const filtered = alphaNumModelMatches.filter(
      (tok) => !/^\d+(GB|TB|MB|MHZ|HZ|W|MAH)$/i.test(tok)
    );
    if (filtered.length > 0) {
      modelNumber = filtered[0].toUpperCase();
    }
  }
  const genMatch = norm.match(
    /\b(iphone\s*\d{1,2}[a-z]?|galaxy\s*[as]\d{1,2}|xm\d|v\d{1,2}|m[1234]\s*(?:pro|max)?|ps\d|ipad\s*(?:pro|air|mini)?\s*\d{0,2})\b/i
  );
  if (genMatch && !generation) {
    generation = genMatch[1].replace(/\s+/g, " ").trim();
  }
  const isAccessory = extra?.isAccessory ?? ACCESSORY_KEYWORDS.some((kw) => lowerTR.includes(kw));
  const isBundle = extra?.isBundle ?? BUNDLE_KEYWORDS.some((kw) => lowerTR.includes(kw));
  let model = extra?.model || "";
  if (!model) {
    if (generation) {
      model = `${generation.toUpperCase()}${variantTier ? " " + variantTier.toUpperCase() : ""}`;
    } else if (modelNumber) {
      model = modelNumber;
    } else {
      const words = title.replace(new RegExp(`^${brand}\\s*`, "i"), "").split(/\s+/).slice(0, 4).join(" ");
      model = words || title;
    }
  }
  return {
    brand,
    manufacturer: extra?.manufacturer || brand,
    model,
    modelNumber,
    sku: extra?.sku || "",
    ean: extra?.ean || "",
    upc: extra?.upc || "",
    productCode: extra?.productCode || modelNumber || "",
    storage,
    ram,
    color,
    size: extra?.size || "",
    generation,
    variantTier,
    isBundle,
    isAccessory
  };
}
function compareProducts(referenceTitle, candidateTitle, referenceExtra, candidateExtra) {
  const ref = extractProductSpecs(referenceTitle, referenceExtra);
  const cand = extractProductSpecs(candidateTitle, candidateExtra);
  const reasons = [];
  const mismatches = [];
  if (ref.ean && cand.ean && ref.ean.length >= 8 && ref.ean === cand.ean) {
    return {
      confidence: "Kesin e\u015Fle\u015Fme",
      score: 100,
      includeInAutoComparison: true,
      reasons: [`EAN/Barkod kodu birebir e\u015Fle\u015Fti (${ref.ean})`],
      mismatches: []
    };
  }
  if (ref.isAccessory !== cand.isAccessory) {
    return {
      confidence: "Farkl\u0131 \xFCr\xFCn",
      score: 10,
      includeInAutoComparison: false,
      reasons: [],
      mismatches: ["Ana \xFCr\xFCn ile aksesuar/k\u0131l\u0131f uyu\u015Fmazl\u0131\u011F\u0131"]
    };
  }
  if (ref.brand && cand.brand && normalizeTextTR(ref.brand) !== normalizeTextTR(cand.brand)) {
    return {
      confidence: "Farkl\u0131 \xFCr\xFCn",
      score: 15,
      includeInAutoComparison: false,
      reasons: [],
      mismatches: [`Marka farkl\u0131 (${ref.brand} \u2260 ${cand.brand})`]
    };
  }
  if (ref.brand && cand.brand) {
    reasons.push(`Marka e\u015Fle\u015Fti (${ref.brand})`);
  }
  if (ref.generation || cand.generation) {
    if (ref.generation !== cand.generation) {
      return {
        confidence: "Farkl\u0131 \xFCr\xFCn",
        score: 20,
        includeInAutoComparison: false,
        reasons,
        mismatches: [
          `Model serisi/nesli farkl\u0131 (${ref.generation || "Belirsiz"} \u2260 ${cand.generation || "Belirsiz"})`
        ]
      };
    }
    reasons.push(`Model nesli e\u015Fle\u015Fti (${(ref.generation || "").toUpperCase()})`);
  }
  if (ref.modelNumber && cand.modelNumber) {
    const normRefModel = ref.modelNumber.replace(/[-_\s]/g, "");
    const normCandModel = cand.modelNumber.replace(/[-_\s]/g, "");
    if (normRefModel !== normCandModel) {
      return {
        confidence: "Farkl\u0131 \xFCr\xFCn",
        score: 25,
        includeInAutoComparison: false,
        reasons,
        mismatches: [`Model kodu farkl\u0131 (${ref.modelNumber} \u2260 ${cand.modelNumber})`]
      };
    }
    reasons.push(`Model kodu birebir e\u015Fle\u015Fti (${ref.modelNumber})`);
  }
  if ((ref.variantTier || "") !== (cand.variantTier || "")) {
    return {
      confidence: "Farkl\u0131 \xFCr\xFCn",
      score: 30,
      includeInAutoComparison: false,
      reasons,
      mismatches: [
        `Model varyant\u0131 farkl\u0131 (${ref.variantTier || "Standart"} \u2260 ${cand.variantTier || "Standart"})`
      ]
    };
  }
  const refTokens = normalizeTextTR(referenceTitle).split(" ").filter((w) => w.length > 1);
  const candTokens = new Set(
    normalizeTextTR(candidateTitle).split(" ").filter((w) => w.length > 1)
  );
  const commonCount = refTokens.filter((t) => candTokens.has(t)).length;
  const overlapRatio = refTokens.length > 0 ? commonCount / refTokens.length : 0;
  if (overlapRatio < 0.35 && !ref.modelNumber && !ref.generation) {
    return {
      confidence: "Farkl\u0131 \xFCr\xFCn",
      score: Math.round(overlapRatio * 100),
      includeInAutoComparison: false,
      reasons,
      mismatches: ["\xDCr\xFCn ba\u015Fl\u0131\u011F\u0131 benzerli\u011Fi \xE7ok d\xFC\u015F\xFCk"]
    };
  }
  let storageMismatch = false;
  if (ref.storage && cand.storage) {
    if (ref.storage !== cand.storage) {
      storageMismatch = true;
      mismatches.push(`Depolama kapasitesi farkl\u0131 (${ref.storage} \u2260 ${cand.storage})`);
    } else {
      reasons.push(`Depolama kapasitesi e\u015Fle\u015Fti (${ref.storage})`);
    }
  } else if (ref.storage && !cand.storage) {
    mismatches.push(`Aday \xFCr\xFCnde depolama kapasitesi (${ref.storage}) belirtilmemi\u015F`);
  }
  let ramMismatch = false;
  if (ref.ram && cand.ram && ref.ram !== cand.ram) {
    ramMismatch = true;
    mismatches.push(`RAM kapasitesi farkl\u0131 (${ref.ram} \u2260 ${cand.ram})`);
  }
  let colorMismatch = false;
  if (ref.color && cand.color) {
    if (ref.color !== cand.color) {
      colorMismatch = true;
      mismatches.push(`Renk farkl\u0131 (${ref.color} \u2260 ${cand.color})`);
    } else {
      reasons.push(`Renk e\u015Fle\u015Fti`);
    }
  }
  if (ref.isBundle !== cand.isBundle) {
    return {
      confidence: "Benzer \xFCr\xFCn",
      score: 60,
      includeInAutoComparison: false,
      reasons,
      mismatches: [...mismatches, "Tekli \xFCr\xFCn / Paket (Bundle) fark\u0131"]
    };
  }
  if (storageMismatch || ramMismatch) {
    return {
      confidence: "Benzer \xFCr\xFCn",
      score: 68,
      includeInAutoComparison: false,
      reasons,
      mismatches
    };
  }
  if (colorMismatch) {
    return {
      confidence: "Benzer \xFCr\xFCn",
      score: 74,
      includeInAutoComparison: false,
      reasons,
      mismatches
    };
  }
  const hasStrongIdentity = Boolean(ref.sku && cand.sku && ref.sku === cand.sku) || Boolean(ref.modelNumber && cand.modelNumber && ref.modelNumber === cand.modelNumber) || Boolean(ref.generation && (!ref.storage || ref.storage === cand.storage) && (!ref.color || ref.color === cand.color));
  if (hasStrongIdentity && mismatches.length === 0) {
    return {
      confidence: "Kesin e\u015Fle\u015Fme",
      score: 98,
      includeInAutoComparison: true,
      reasons,
      mismatches: []
    };
  }
  if (overlapRatio >= 0.75 && mismatches.length === 0) {
    return {
      confidence: "Kesin e\u015Fle\u015Fme",
      score: 94,
      includeInAutoComparison: true,
      reasons,
      mismatches: []
    };
  }
  if (overlapRatio >= 0.5 || hasStrongIdentity) {
    return {
      confidence: "Y\xFCksek e\u015Fle\u015Fme",
      score: 85,
      includeInAutoComparison: true,
      reasons,
      mismatches
    };
  }
  return {
    confidence: "Benzer \xFCr\xFCn",
    score: 65,
    includeInAutoComparison: false,
    reasons,
    mismatches
  };
}

// src/server/storeAdapters.ts
import * as cheerio from "cheerio";
var lastRequestByDomain = /* @__PURE__ */ new Map();
var robotsCacheByDomain = /* @__PURE__ */ new Map();
var MIN_DOMAIN_INTERVAL_MS = 1200;
async function waitForDomainRateLimit(domain) {
  const now = Date.now();
  const last = lastRequestByDomain.get(domain) || 0;
  const elapsed = now - last;
  if (elapsed < MIN_DOMAIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DOMAIN_INTERVAL_MS - elapsed));
  }
  lastRequestByDomain.set(domain, Date.now());
}
async function isAllowedByRobotsTxt(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const domain = parsed.hostname;
    const cached = robotsCacheByDomain.get(domain);
    const now = Date.now();
    let disallowedPaths = [];
    if (cached && now - cached.fetchedAt < 36e5) {
      disallowedPaths = cached.disallowedPaths;
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(`${parsed.protocol}//${domain}/robots.txt`, {
          signal: controller.signal,
          headers: {
            "User-Agent": "FiyatTakipAgent/1.0 (macOS Desktop Price Monitor; +https://localhost)"
          }
        });
        if (res.ok) {
          const text = await res.text();
          let inGlobalUserAgent = false;
          for (const rawLine of text.split("\n")) {
            const line = rawLine.trim();
            if (line.toLowerCase().startsWith("user-agent:")) {
              const agent = line.slice(11).trim();
              inGlobalUserAgent = agent === "*";
            } else if (inGlobalUserAgent && line.toLowerCase().startsWith("disallow:")) {
              const pathRule = line.slice(9).trim();
              if (pathRule && pathRule !== "/") {
                disallowedPaths.push(pathRule);
              }
            }
          }
        }
      } catch {
      } finally {
        clearTimeout(timeout);
      }
      robotsCacheByDomain.set(domain, { disallowedPaths, fetchedAt: now });
    }
    for (const rule of disallowedPaths) {
      if (rule === "/") {
        return false;
      }
      const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
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
async function resolveCanonicalProductUrl(rawUrl) {
  const norm = normalizeProductUrl(rawUrl);
  if (!norm.isValid) return rawUrl;
  try {
    const u = new URL(norm.normalizedUrl);
    const host = u.hostname.toLowerCase();
    const isShortener = host === "amzn.eu" || host === "amzn.to" || host === "a.co" || host === "ty.gl" || host === "app.hb.biz" || host.endsWith(".adj.st");
    if (!isShortener) {
      return norm.normalizedUrl;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(norm.normalizedUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "tr-TR,tr;q=0.9"
        }
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
  }
  return norm.normalizedUrl;
}
var BROWSER_PROFILES = [
  {
    name: "desktop-chrome-tr",
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "max-age=0",
      "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1"
    }
  },
  {
    name: "ios-safari-tr",
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9",
      "Cache-Control": "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none"
    }
  }
];
async function fetchHtmlSafely(url, options) {
  const norm = normalizeProductUrl(url);
  if (!norm.isValid) {
    return {
      ok: false,
      status: 0,
      html: "",
      finalUrl: url,
      blockedByProtection: false,
      errorReason: norm.error
    };
  }
  if (!options?.skipRobots) {
    const allowed = await isAllowedByRobotsTxt(norm.normalizedUrl);
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        html: "",
        finalUrl: norm.normalizedUrl,
        blockedByProtection: true,
        errorReason: "Ma\u011Faza robots.txt kurallar\u0131 bu sayfan\u0131n otomatik taranmas\u0131na izin vermiyor."
      };
    }
  }
  await waitForDomainRateLimit(norm.domain);
  const profile = BROWSER_PROFILES[(options?.profileIndex || 0) % BROWSER_PROFILES.length];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9e3);
  try {
    const response = await fetch(norm.normalizedUrl, {
      signal: controller.signal,
      headers: {
        ...profile.headers,
        ...options?.customHeaders || {}
      },
      redirect: "follow"
    });
    const html = await response.text();
    const lowerHtml = html.toLowerCase();
    const isAmazonCaptcha = lowerHtml.includes("validatecaptcha") || lowerHtml.includes("/errors/validatecaptcha") || lowerHtml.includes("robot olmad\u0131\u011F\u0131n\u0131z\u0131") || lowerHtml.includes("a\u015Fa\u011F\u0131daki karakterleri girin") || lowerHtml.includes("enter the characters you see below") || lowerHtml.includes("api-services-support@amazon.com");
    const isCloudflareOrAntiBot = response.status === 403 || response.status === 429 || response.status === 503 || isAmazonCaptcha || lowerHtml.includes("cf-chl-bypass") || lowerHtml.includes("cloudflare") && lowerHtml.includes("challenge-platform") || lowerHtml.includes("captcha") && html.length < 15e3 || lowerHtml.includes("access denied") && html.length < 1e4;
    if (!response.ok || isCloudflareOrAntiBot) {
      return {
        ok: false,
        status: response.status,
        html,
        finalUrl: response.url || norm.normalizedUrl,
        blockedByProtection: isCloudflareOrAntiBot,
        errorReason: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
      };
    }
    return {
      ok: true,
      status: response.status,
      html,
      finalUrl: response.url || norm.normalizedUrl,
      blockedByProtection: false
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      html: "",
      finalUrl: norm.normalizedUrl,
      blockedByProtection: false,
      errorReason: message.includes("abort") ? "Ma\u011Faza yan\u0131t s\xFCresi zaman a\u015F\u0131m\u0131na u\u011Frad\u0131." : "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    };
  } finally {
    clearTimeout(timeout);
  }
}
function extractIdentityFromUrlSlug(urlStr) {
  try {
    const u = new URL(urlStr);
    const segments = u.pathname.split("/").map((s) => decodeURIComponent(s).trim()).filter(Boolean);
    let sku = "";
    const pMatch = u.pathname.match(/-p-(\d+)/i);
    if (pMatch) sku = pMatch[1];
    const hbMatch = u.pathname.match(/-p[m]?-(HB[A-Z0-9]+)/i);
    if (!sku && hbMatch) sku = hbMatch[1];
    const dpMatch = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (!sku && dpMatch) sku = dpMatch[1];
    const cleanedSegments = segments.map(
      (seg) => seg.replace(/\.html?$/i, "").replace(/-p-\d+$/i, "").replace(/-p[m]?-hb[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim()
    ).filter((seg) => seg.length > 2 && !/^(dp|gp|product|urun|detay|fiyati)$/i.test(seg));
    let rawTitle = cleanedSegments.sort((a, b) => b.length - a.length)[0] || "";
    if (segments.length >= 2 && segments[0].length <= 20 && !rawTitle.toLowerCase().startsWith(segments[0].toLowerCase())) {
      const possibleBrand = segments[0].replace(/[-_]+/g, " ").trim();
      if (!/^(urun|product|dp|gp|katalog|magaza)$/i.test(possibleBrand)) {
        rawTitle = `${possibleBrand} ${rawTitle}`;
      }
    }
    const title = rawTitle.split(/\s+/).map((w) => {
      if (/^(gb|tb|ram|ssd|uhd|oled|led|anc|tws|ps5|xm5|xm4|m1|m2|m3|m4|usb|type-c)$/i.test(w)) {
        return w.toUpperCase();
      }
      if (/^iphone$/i.test(w)) return "iPhone";
      if (/^ipad$/i.test(w)) return "iPad";
      if (/^macbook$/i.test(w)) return "MacBook";
      if (/^airpods$/i.test(w)) return "AirPods";
      return w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1);
    }).join(" ");
    const specs = extractProductSpecs(title);
    return {
      title: title || "Bilinmeyen \xDCr\xFCn",
      brand: specs.brand,
      sku
    };
  } catch {
    return { title: "Bilinmeyen \xDCr\xFCn", brand: "", sku: "" };
  }
}
var BaseTurkishStoreAdapter = class {
  normalizeProduct(raw) {
    const specs = extractProductSpecs(raw.title, {
      brand: raw.brand,
      sku: raw.sku,
      ean: raw.ean,
      productCode: raw.sku
    });
    return {
      ...raw,
      brand: specs.brand || raw.brand,
      model: specs.model || raw.model,
      specs
    };
  }
  parseJsonLdProduct($) {
    const result = {};
    const scripts = $('script[type="application/ld+json"]');
    scripts.each((_, el) => {
      try {
        const rawJson = $(el).contents().text().trim();
        if (!rawJson) return;
        const parsed = JSON.parse(rawJson);
        const candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] && Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
        for (const item of candidates) {
          if (!item || typeof item !== "object") continue;
          const type = String(item["@type"] || "");
          if (type.toLowerCase().includes("product")) {
            if (item.name && !result.title) {
              result.title = String(item.name).trim();
            }
            if (item.brand) {
              result.brand = typeof item.brand === "string" ? item.brand : String(item.brand.name || "").trim();
            }
            if (item.sku && !result.sku) {
              result.sku = String(item.sku).trim();
            }
            if ((item.gtin13 || item.gtin || item.ean) && !result.ean) {
              result.ean = String(item.gtin13 || item.gtin || item.ean).trim();
            }
            if (item.image && !result.image) {
              if (typeof item.image === "string") {
                result.image = item.image;
              } else if (Array.isArray(item.image) && item.image.length > 0) {
                result.image = typeof item.image[0] === "string" ? item.image[0] : String(item.image[0]?.url || "");
              } else if (item.image.url) {
                result.image = String(item.image.url);
              }
            }
            const offers = item.offers;
            if (offers) {
              const offerObj = Array.isArray(offers) ? offers[0] : offers;
              if (offerObj) {
                const rawPrice = offerObj.price ?? offerObj.lowPrice ?? offerObj.highPrice;
                const currency = offerObj.priceCurrency || "TRY";
                if (rawPrice !== void 0 && rawPrice !== null) {
                  const parsedPrice = parsePriceTR(String(rawPrice), currency);
                  if (parsedPrice.isValid && parsedPrice.amount) {
                    result.price = parsedPrice.amount;
                    result.currency = parsedPrice.currency;
                  }
                }
                if (offerObj.availability) {
                  const availStr = String(offerObj.availability).toLowerCase();
                  if (availStr.includes("instock")) {
                    result.availability = "Stokta";
                  } else if (availStr.includes("outofstock") || availStr.includes("soldout")) {
                    result.availability = "T\xFCkendi";
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
      }
    });
    return result;
  }
  async getProductDetails(url) {
    const slugIdentity = extractIdentityFromUrlSlug(url);
    const fetched = await fetchHtmlSafely(url);
    if (!fetched.ok || !fetched.html) {
      await updateStoreStatus({
        storeId: this.storeId,
        status: "unavailable",
        error: fetched.errorReason || "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
      });
      await addSystemLog(
        "WARN",
        "STORE_ERROR",
        `${this.storeName} \xFCr\xFCn sayfas\u0131 okunamad\u0131: ${fetched.errorReason}`,
        { url, status: fetched.status }
      );
      return this.normalizeProduct({
        url,
        storeId: this.storeId,
        storeName: this.storeName,
        storeDomain: this.domain,
        title: slugIdentity.title,
        brand: slugIdentity.brand,
        model: "",
        sku: slugIdentity.sku,
        ean: "",
        price: null,
        currency: "TRY",
        seller: this.storeName,
        availability: "Bilinmiyor",
        image: "",
        isVerifiedFromPage: false,
        errorMessage: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
      });
    }
    const $ = cheerio.load(fetched.html);
    const ld = this.parseJsonLdProduct($);
    let title = ld.title || "";
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
      title = $('meta[property="og:title"]').attr("content")?.trim() || $("h1").first().text().trim() || slugIdentity.title;
    }
    title = title.replace(/\s*[-|]\s*(Trendyol|Hepsiburada|Amazon\.com\.tr|n11\.com|MediaMarkt|Teknosa|Vatan Bilgisayar).*$/i, "").trim();
    let price = ld.price ?? null;
    let currency = ld.currency || "TRY";
    if (price === null) {
      const metaPrice = $('meta[property="product:price:amount"]').attr("content") || $('meta[property="og:price:amount"]').attr("content") || $('meta[name="twitter:data1"]').attr("content");
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
    let availability = ld.availability || "Bilinmiyor";
    if (availability === "Bilinmiyor") {
      const outFound = this.outOfStockSelectors.some((sel) => $(sel).length > 0);
      if (outFound) {
        availability = "T\xFCkendi";
      } else if (price !== null && price > 0) {
        availability = "Stokta";
      }
    }
    const image = ld.image || $('meta[property="og:image"]').attr("content") || $('img[id*="product"], img[class*="product"]').first().attr("src") || "";
    const isVerified = price !== null && price > 0;
    await updateStoreStatus({
      storeId: this.storeId,
      status: isVerified ? "operational" : "unavailable",
      error: isVerified ? null : "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
    return this.normalizeProduct({
      url,
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      title: title || slugIdentity.title,
      brand: ld.brand || slugIdentity.brand,
      model: "",
      sku: ld.sku || slugIdentity.sku,
      ean: ld.ean || "",
      price: isVerified ? price : null,
      currency,
      seller: ld.seller || this.storeName,
      availability,
      image,
      isVerifiedFromPage: isVerified,
      errorMessage: isVerified ? void 0 : "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
  }
  async getPrice(url) {
    const details = await this.getProductDetails(url);
    return {
      price: details.price,
      currency: details.currency,
      error: details.errorMessage
    };
  }
  async getAvailability(url) {
    const details = await this.getProductDetails(url);
    return details.availability;
  }
  async getProductImage(url) {
    const details = await this.getProductDetails(url);
    return details.image;
  }
  async searchProduct(query, referenceTitle, referenceSpecs) {
    const searchUrl = this.searchUrlTemplate.replace("{query}", encodeURIComponent(query));
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const fetched = await fetchHtmlSafely(searchUrl);
    if (!fetched.ok || !fetched.html) {
      await updateStoreStatus({
        storeId: this.storeId,
        status: "unavailable",
        error: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
      });
      return {
        storeId: this.storeId,
        storeName: this.storeName,
        storeDomain: this.domain,
        url: searchUrl,
        title: referenceTitle,
        seller: this.storeName,
        price: null,
        currency: "TRY",
        availability: "Bilinmiyor",
        matchConfidence: "Farkl\u0131 \xFCr\xFCn",
        matchScore: 0,
        status: "unavailable",
        statusMessage: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.",
        checkedAt: now
      };
    }
    const $ = cheerio.load(fetched.html);
    const items = $(this.searchItemSelectors.container).slice(0, 8);
    let bestCandidate = null;
    items.each((_, el) => {
      const candidateTitle = $(el).find(this.searchItemSelectors.title).first().text().trim();
      const rawPrice = $(el).find(this.searchItemSelectors.price).first().text().trim();
      let href = $(el).find(this.searchItemSelectors.link).first().attr("href") || $(el).attr("href") || "";
      if (!candidateTitle || !rawPrice) return;
      const parsedPrice = parsePriceTR(rawPrice, "TRY");
      if (!parsedPrice.isValid || !parsedPrice.amount) return;
      if (href && href.startsWith("/")) {
        href = `https://www.${this.domain}${href}`;
      }
      const comparison = compareProducts(referenceTitle, candidateTitle, referenceSpecs);
      if (!bestCandidate || comparison.score > bestCandidate.matchScore || comparison.score === bestCandidate.matchScore && parsedPrice.amount < (bestCandidate.price || Infinity)) {
        bestCandidate = {
          storeId: this.storeId,
          storeName: this.storeName,
          storeDomain: this.domain,
          url: href || searchUrl,
          title: candidateTitle,
          seller: this.storeName,
          price: parsedPrice.amount,
          currency: parsedPrice.currency,
          availability: "Stokta",
          matchConfidence: comparison.confidence,
          matchScore: comparison.score,
          status: "verified",
          statusMessage: "Fiyat do\u011Fruland\u0131",
          checkedAt: now
        };
      }
    });
    if (bestCandidate) {
      await updateStoreStatus({ storeId: this.storeId, status: "operational" });
      return bestCandidate;
    }
    await updateStoreStatus({
      storeId: this.storeId,
      status: "unavailable",
      error: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
    return {
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      url: searchUrl,
      title: referenceTitle,
      seller: this.storeName,
      price: null,
      currency: "TRY",
      availability: "Bilinmiyor",
      matchConfidence: "Farkl\u0131 \xFCr\xFCn",
      matchScore: 0,
      status: "unavailable",
      statusMessage: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.",
      checkedAt: now
    };
  }
  async healthCheck() {
    const start = Date.now();
    const res = await fetchHtmlSafely(`https://www.${this.domain}`);
    const latencyMs = Date.now() - start;
    await updateStoreStatus({
      storeId: this.storeId,
      status: res.ok ? "operational" : "unavailable",
      error: res.ok ? null : "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
    return {
      operational: res.ok,
      statusCode: res.status,
      latencyMs,
      message: res.ok ? "\xC7al\u0131\u015F\u0131yor" : "Ge\xE7ici olarak kullan\u0131lam\u0131yor"
    };
  }
};
var TrendyolAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "trendyol";
    this.storeName = "Trendyol";
    this.domain = "trendyol.com";
    this.searchUrlTemplate = "https://www.trendyol.com/sr?q={query}";
    this.priceSelectors = [".prc-dsc", ".product-price-container .prc-dsc", ".prc-box-dscntd"];
    this.titleSelectors = ["h1.pr-new-br", ".pr-in-cn h1"];
    this.outOfStockSelectors = [".sold-out", ".out-of-stock"];
    this.searchItemSelectors = {
      container: ".p-card-wrppr",
      title: ".prdct-desc-cntnr-name",
      price: ".prc-box-dscntd, .prc-dsc",
      link: "a"
    };
  }
};
var HepsiburadaAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "hepsiburada";
    this.storeName = "Hepsiburada";
    this.domain = "hepsiburada.com";
    this.searchUrlTemplate = "https://www.hepsiburada.com/ara?q={query}";
    this.priceSelectors = [
      '[data-test-id="price-current-price"]',
      "#offering-price",
      ".product-price"
    ];
    this.titleSelectors = ["h1#product-name", '[data-test-id="title"]'];
    this.outOfStockSelectors = [".out-of-stock"];
    this.searchItemSelectors = {
      container: '[data-test-id="product-card-container"], li.productListContent-zAP0Y5msy8OHn5z7T_K_',
      title: '[data-test-id="product-card-name"], h3',
      price: '[data-test-id="price-current-price"]',
      link: "a"
    };
  }
};
var AmazonTrAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "amazon_tr";
    this.storeName = "Amazon T\xFCrkiye";
    this.domain = "amazon.com.tr";
    this.searchUrlTemplate = "https://www.amazon.com.tr/s?k={query}";
    this.priceSelectors = [
      "#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#corePrice_feature_div .priceToPay .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      "#apex_desktop .a-offscreen",
      "#tp_price_block_total_price_ww .a-offscreen",
      ".priceToPay .a-offscreen",
      ".apexPriceToPay .a-offscreen",
      "#price_inside_buybox",
      "#newBuyBoxPrice",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      ".a-price .a-offscreen"
    ];
    this.titleSelectors = ["#productTitle", "#title", "h1#title span"];
    this.outOfStockSelectors = ["#outOfStock", '#availability span:contains("Stokta yok")'];
    this.searchItemSelectors = {
      container: '[data-component-type="s-search-result"]',
      title: "h2 span",
      price: ".a-price .a-offscreen",
      link: "h2 a"
    };
  }
  extractAsin(urlStr) {
    const match = urlStr.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : "";
  }
  extractAmazonDomDetails(html, url, asin) {
    const $ = cheerio.load(html);
    const ld = this.parseJsonLdProduct($);
    let title = ld.title || $("#productTitle").text().trim() || $("#title").text().trim() || $('meta[property="og:title"]').attr("content")?.trim() || $("title").text().trim() || "";
    title = title.replace(/\s*[:|-]\s*Amazon\.com\.tr.*$/i, "").replace(/^Amazon\.com\.tr\s*[:|-]\s*/i, "").trim();
    let brand = ld.brand || $("#bylineInfo").text().replace(/Marka:\s*/i, "").replace(/\s*Store'unu ziyaret edin/i, "").replace(/\s*Mağazasını ziyaret edin/i, "").trim();
    let price = ld.price ?? null;
    let currency = ld.currency || "TRY";
    if (price === null) {
      const hiddenPriceVal = $("input#twister-plus-price-data-price").attr("value") || $("input#attach-base-product-price").attr("value") || $("[data-asin-price]").attr("data-asin-price");
      if (hiddenPriceVal) {
        const parsed = parsePriceTR(hiddenPriceVal, "TRY");
        if (parsed.isValid && parsed.amount) {
          price = parsed.amount;
        }
      }
    }
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
    if (price === null) {
      const priceContainers = $(
        "#corePriceDisplay_desktop_feature_div, #corePrice_feature_div, #apex_desktop, #tp_price_block_total_price_ww, .priceToPay, .a-price"
      );
      priceContainers.each((_, container) => {
        if (price !== null) return;
        const wholeRaw = $(container).find(".a-price-whole").first().clone().children().remove().end().text().replace(/[^\d.]/g, "").trim();
        const fractionRaw = $(container).find(".a-price-fraction").first().text().replace(/[^\d]/g, "").trim();
        if (wholeRaw) {
          const combined = fractionRaw ? `${wholeRaw},${fractionRaw} TL` : `${wholeRaw} TL`;
          const parsed = parsePriceTR(combined, "TRY");
          if (parsed.isValid && parsed.amount) {
            price = parsed.amount;
          }
        }
      });
    }
    if (price === null) {
      const jsonPriceMatch = html.match(/"priceAmount"\s*:\s*(\d+(?:\.\d{1,2})?)/) || html.match(/"buyingPrice"\s*:\s*(\d+(?:\.\d{1,2})?)/) || html.match(/"displayPrice"\s*:\s*"([^"]+)"/);
      if (jsonPriceMatch && jsonPriceMatch[1]) {
        const parsed = parsePriceTR(jsonPriceMatch[1], "TRY");
        if (parsed.isValid && parsed.amount) {
          price = parsed.amount;
        }
      }
    }
    let image = ld.image || $("#landingImage").attr("data-old-hires") || $("#landingImage").attr("src") || $("#main-image").attr("src") || $('meta[property="og:image"]').attr("content") || "";
    if (!image) {
      const dynamicImgJson = $("#landingImage").attr("data-a-dynamic-image");
      if (dynamicImgJson) {
        try {
          const urls = Object.keys(JSON.parse(dynamicImgJson));
          if (urls.length > 0) image = urls[0];
        } catch {
        }
      }
    }
    const availText = $("#availability").text().toLowerCase();
    let availability = ld.availability || "Bilinmiyor";
    if (availText.includes("stokta yok") || availText.includes("mevcut de\u011Fil") || $("#outOfStock").length > 0) {
      availability = "T\xFCkendi";
    } else if (price !== null && price > 0) {
      availability = "Stokta";
    }
    const seller = $("#sellerProfileTriggerId").first().text().trim() || $('#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sat\u0131c\u0131"]').text().trim() || ld.seller || this.storeName;
    return {
      title,
      brand,
      price,
      currency,
      seller,
      availability,
      image
    };
  }
  async getProductDetails(rawUrl) {
    const resolvedUrl = await resolveCanonicalProductUrl(rawUrl);
    const slugIdentity = extractIdentityFromUrlSlug(resolvedUrl);
    const asin = this.extractAsin(resolvedUrl) || slugIdentity.sku;
    const urlsToTry = [
      { url: resolvedUrl, profileIndex: 0 }
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
    let bestImage = "";
    for (const attempt of urlsToTry) {
      const fetched = await fetchHtmlSafely(attempt.url, {
        profileIndex: attempt.profileIndex,
        skipRobots: true,
        customHeaders: {
          Referer: "https://www.google.com.tr/"
        }
      });
      if (fetched.ok && fetched.html) {
        const extracted = this.extractAmazonDomDetails(fetched.html, resolvedUrl, asin);
        if (extracted.title && extracted.title !== "Amazon.com.tr") {
          bestTitle = extracted.title;
        }
        if (extracted.brand) bestBrand = extracted.brand;
        if (extracted.image) bestImage = extracted.image;
        if (extracted.price !== null && extracted.price > 0) {
          await updateStoreStatus({
            storeId: this.storeId,
            status: "operational",
            error: null
          });
          return this.normalizeProduct({
            url: resolvedUrl,
            storeId: this.storeId,
            storeName: this.storeName,
            storeDomain: this.domain,
            title: bestTitle,
            brand: bestBrand,
            model: "",
            sku: asin || slugIdentity.sku,
            ean: "",
            price: extracted.price,
            currency: extracted.currency,
            seller: extracted.seller,
            availability: extracted.availability,
            image: bestImage,
            isVerifiedFromPage: true
          });
        }
      }
    }
    const queryTerms = bestTitle && bestTitle !== "Bilinmeyen \xDCr\xFCn" ? bestTitle : asin || "";
    if (queryTerms) {
      try {
        const akakce = new AkakceAdapter();
        const akakceResult = await akakce.searchProduct(queryTerms, bestTitle || queryTerms);
        if (akakceResult.status === "verified" && akakceResult.price && akakceResult.price > 0) {
          await updateStoreStatus({
            storeId: this.storeId,
            status: "operational",
            error: null
          });
          await addSystemLog(
            "INFO",
            "PRICE_CHECK",
            `Amazon T\xFCrkiye fiyat\u0131 CAPTCHA korumas\u0131 nedeniyle Akak\xE7e do\u011Frulamas\u0131 \xFCzerinden al\u0131nd\u0131: ${akakceResult.price} TL`,
            { url: resolvedUrl, asin }
          );
          return this.normalizeProduct({
            url: resolvedUrl,
            storeId: this.storeId,
            storeName: this.storeName,
            storeDomain: this.domain,
            title: akakceResult.title || bestTitle,
            brand: bestBrand,
            model: "",
            sku: asin || slugIdentity.sku,
            ean: "",
            price: akakceResult.price,
            currency: akakceResult.currency,
            seller: this.storeName,
            availability: "Stokta",
            image: bestImage,
            isVerifiedFromPage: true
          });
        }
      } catch {
      }
    }
    await updateStoreStatus({
      storeId: this.storeId,
      status: "unavailable",
      error: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
    return this.normalizeProduct({
      url: resolvedUrl,
      storeId: this.storeId,
      storeName: this.storeName,
      storeDomain: this.domain,
      title: bestTitle,
      brand: bestBrand,
      model: "",
      sku: asin || slugIdentity.sku,
      ean: "",
      price: null,
      currency: "TRY",
      seller: this.storeName,
      availability: "Bilinmiyor",
      image: bestImage,
      isVerifiedFromPage: false,
      errorMessage: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
    });
  }
};
var N11Adapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "n11";
    this.storeName = "N11";
    this.domain = "n11.com";
    this.searchUrlTemplate = "https://www.n11.com/arama?q={query}";
    this.priceSelectors = [".newPrice ins", ".unf-p-summary-price"];
    this.titleSelectors = ["h1.proName"];
    this.outOfStockSelectors = [".outOfStock"];
    this.searchItemSelectors = {
      container: "li.column",
      title: "h3.productName",
      price: ".newPrice ins",
      link: "a.plink"
    };
  }
};
var CicekSepetiAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "ciceksepeti";
    this.storeName = "\xC7i\xE7ekSepeti";
    this.domain = "ciceksepeti.com";
    this.searchUrlTemplate = "https://www.ciceksepeti.com/arama?query={query}";
    this.priceSelectors = [".js-price-integer", ".product__price"];
    this.titleSelectors = [".js-product-title", "h1"];
    this.outOfStockSelectors = [".product__stock-out"];
    this.searchItemSelectors = {
      container: ".products__item",
      title: ".products__item-title",
      price: ".price--now",
      link: "a"
    };
  }
};
var MediaMarktAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "mediamarkt";
    this.storeName = "MediaMarkt T\xFCrkiye";
    this.domain = "mediamarkt.com.tr";
    this.searchUrlTemplate = "https://www.mediamarkt.com.tr/tr/search.html?query={query}";
    this.priceSelectors = ['[data-test="branded-price-whole-value"]', ".price"];
    this.titleSelectors = ["h1"];
    this.outOfStockSelectors = ['[data-test="mms-pdp-out-of-stock"]'];
    this.searchItemSelectors = {
      container: '[data-test="mms-search-srp-productlist-item"]',
      title: '[data-test="product-title"]',
      price: '[data-test="branded-price-whole-value"]',
      link: "a"
    };
  }
};
var TeknosaAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "teknosa";
    this.storeName = "Teknosa";
    this.domain = "teknosa.com";
    this.searchUrlTemplate = "https://www.teknosa.com/arama/?s={query}";
    this.priceSelectors = [".prc-first", ".pdp-prc2"];
    this.titleSelectors = ["h1.pdp-title"];
    this.outOfStockSelectors = [".pdp-out-of-stock"];
    this.searchItemSelectors = {
      container: "#product-item",
      title: ".prd-title",
      price: ".prc-first",
      link: "a.prd-link"
    };
  }
};
var VatanBilgisayarAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "vatan";
    this.storeName = "Vatan Bilgisayar";
    this.domain = "vatanbilgisayar.com";
    this.searchUrlTemplate = "https://www.vatanbilgisayar.com/arama/{query}/";
    this.priceSelectors = [".product-list__price", ".product-detail .product-list__price"];
    this.titleSelectors = ["h1.product-list__product-name"];
    this.outOfStockSelectors = [".out-of-stock"];
    this.searchItemSelectors = {
      container: ".product-list--list-page",
      title: ".product-list__product-name h3",
      price: ".product-list__price",
      link: "a.product-list__link"
    };
  }
};
var PazaramaAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "pazarama";
    this.storeName = "Pazarama";
    this.domain = "pazarama.com";
    this.searchUrlTemplate = "https://www.pazarama.com/arama?q={query}";
    this.priceSelectors = [".product-price", '[data-testid="product-price"]'];
    this.titleSelectors = ["h1"];
    this.outOfStockSelectors = [".out-of-stock"];
    this.searchItemSelectors = {
      container: ".product-card",
      title: ".product-card__title",
      price: ".product-card__price",
      link: "a"
    };
  }
};
var AkakceAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "akakce";
    this.storeName = "Akak\xE7e";
    this.domain = "akakce.com";
    this.searchUrlTemplate = "https://www.akakce.com/arama/?q={query}";
    this.priceSelectors = [".pt_v8", "#pd_v8 .pt_v8"];
    this.titleSelectors = [".pdt_v8 h1", "h1"];
    this.outOfStockSelectors = [];
    this.searchItemSelectors = {
      container: "li[data-pr]",
      title: "h3.pn_v8",
      price: ".pt_v8",
      link: "a"
    };
  }
};
var CimriAdapter = class extends BaseTurkishStoreAdapter {
  constructor() {
    super(...arguments);
    this.storeId = "cimri";
    this.storeName = "Cimri";
    this.domain = "cimri.com";
    this.searchUrlTemplate = "https://www.cimri.com/arama?q={query}";
    this.priceSelectors = [".rTdMX", ".offer-price"];
    this.titleSelectors = ["h1.s1wytv2f-0", "h1"];
    this.outOfStockSelectors = [];
    this.searchItemSelectors = {
      container: "article",
      title: "h3",
      price: ".top-offers price",
      link: "a"
    };
  }
};
var ADAPTER_REGISTRY = [
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
  new CimriAdapter()
];
function getAllStoreAdapters() {
  return ADAPTER_REGISTRY;
}
function getStoreAdapterById(storeId) {
  return ADAPTER_REGISTRY.find((a) => a.storeId === storeId);
}
function getStoreAdapterByUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === "amzn.eu" || host === "amzn.to" || host === "a.co" || host.includes("amazon.com.tr")) {
      return ADAPTER_REGISTRY.find((a) => a.storeId === "amazon_tr");
    }
    if (host === "ty.gl") {
      return ADAPTER_REGISTRY.find((a) => a.storeId === "trendyol");
    }
    if (host === "app.hb.biz") {
      return ADAPTER_REGISTRY.find((a) => a.storeId === "hepsiburada");
    }
    return ADAPTER_REGISTRY.find((a) => host === a.domain || host.endsWith(`.${a.domain}`));
  } catch {
    return void 0;
  }
}

// src/server/priceTrackerService.ts
async function checkInternetConnection() {
  try {
    await dns.lookup("www.google.com");
    return true;
  } catch {
    try {
      await dns.lookup("www.trendyol.com");
      return true;
    } catch {
      return false;
    }
  }
}
async function analyzeProductUrl(rawUrl) {
  const normInitial = normalizeProductUrl(rawUrl);
  if (!normInitial.isValid) {
    throw new Error(normInitial.error || "Ge\xE7ersiz \xFCr\xFCn ba\u011Flant\u0131s\u0131.");
  }
  const online = await checkInternetConnection();
  if (!online) {
    throw new Error("\u0130nternet ba\u011Flant\u0131s\u0131 yok. Fiyat kontrol\xFC daha sonra tekrar denenecek.");
  }
  const canonicalUrl = await resolveCanonicalProductUrl(normInitial.normalizedUrl);
  const norm = normalizeProductUrl(canonicalUrl);
  const effectiveUrl = norm.isValid ? norm.normalizedUrl : normInitial.normalizedUrl;
  const effectiveDomain = norm.isValid ? norm.domain : normInitial.domain;
  const matchedAdapter = getStoreAdapterByUrl(effectiveUrl) || getStoreAdapterByUrl(normInitial.normalizedUrl);
  const primaryAdapter = matchedAdapter || new TrendyolAdapter();
  const storeId = matchedAdapter ? matchedAdapter.storeId : "trendyol";
  const storeName = matchedAdapter ? matchedAdapter.storeName : effectiveDomain;
  await addSystemLog("INFO", "PRICE_CHECK", `\xDCr\xFCn ba\u011Flant\u0131s\u0131 analiz ediliyor: ${effectiveUrl}`, {
    storeName
  });
  const details = await primaryAdapter.getProductDetails(effectiveUrl);
  const slugFallback = extractIdentityFromUrlSlug(effectiveUrl);
  const productTitle = details.title && details.title !== "Bilinmeyen \xDCr\xFCn" ? details.title : slugFallback.title;
  const specs = extractProductSpecs(productTitle, {
    brand: details.brand || slugFallback.brand,
    sku: details.sku || slugFallback.sku,
    ean: details.ean
  });
  const allStores = await getAllStores();
  const enabledStoreIds = new Set(allStores.filter((s) => s.enabled).map((s) => s.id));
  const otherAdapters = getAllStoreAdapters().filter(
    (a) => a.storeId !== storeId && enabledStoreIds.has(a.storeId)
  );
  const searchQuery = [specs.brand, specs.model, specs.storage, specs.color].filter(Boolean).join(" ").trim() || (productTitle !== "Bilinmeyen \xDCr\xFCn" ? productTitle : specs.sku || slugFallback.sku);
  const otherStoreOffers = [];
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
  const verifiedCrossStoreOffers = otherStoreOffers.filter(
    (o) => o.status === "verified" && o.price !== null && o.price > 0 && (o.matchConfidence === "Kesin e\u015Fle\u015Fme" || o.matchConfidence === "Y\xFCksek e\u015Fle\u015Fme")
  ).sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  const bestFallbackOffer = verifiedCrossStoreOffers[0];
  const resolvedPrice = details.isVerifiedFromPage && details.price !== null ? details.price : bestFallbackOffer?.price ?? null;
  const isVerified = details.isVerifiedFromPage && details.price !== null || Boolean(bestFallbackOffer);
  await addSystemLog(
    "INFO",
    "PRODUCT_MATCH",
    `\xDCr\xFCn analizi tamamland\u0131: "${productTitle}" (${otherStoreOffers.filter((o) => o.status === "verified").length} ma\u011Fazada fiyat do\u011Fruland\u0131)`,
    {
      productTitle,
      primaryPrice: resolvedPrice,
      verifiedStores: otherStoreOffers.filter((o) => o.status === "verified").length
    }
  );
  return {
    url: rawUrl,
    normalizedUrl: effectiveUrl,
    storeId,
    storeName,
    name: productTitle === "Bilinmeyen \xDCr\xFCn" && bestFallbackOffer?.title ? bestFallbackOffer.title : productTitle,
    brand: specs.brand || details.brand || "Belirtilmemi\u015F",
    model: specs.model || details.model || productTitle,
    productCode: specs.productCode || details.sku || slugFallback.sku || "",
    ean: specs.ean || details.ean || "",
    price: resolvedPrice,
    currency: details.currency || "TRY",
    seller: details.isVerifiedFromPage && details.price !== null ? details.seller || storeName : bestFallbackOffer ? `${storeName} (${bestFallbackOffer.storeName} do\u011Frulamas\u0131)` : storeName,
    availability: isVerified ? "Stokta" : details.availability,
    image: details.image || "",
    specs,
    extractionStatus: isVerified ? "verified" : "blocked_or_unavailable",
    extractionMessage: isVerified ? void 0 : "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.",
    otherStoreOffers
  };
}
async function checkSingleProductPrices(productId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const online = await checkInternetConnection();
  if (!online) {
    await addSystemLog(
      "WARN",
      "FAILED_CHECK",
      "\u0130nternet ba\u011Flant\u0131s\u0131 yok. Fiyat kontrol\xFC daha sonra tekrar denenecek.",
      { productId }
    );
    return {
      offline: true,
      message: "\u0130nternet ba\u011Flant\u0131s\u0131 yok. Fiyat kontrol\xFC daha sonra tekrar denenecek.",
      checkedProductsCount: 0,
      checkedOffersCount: 0,
      successfulOffersCount: 0,
      failedOffersCount: 0,
      priceDropsDetected: 0,
      notificationsTriggered: [],
      checkedAt: now
    };
  }
  const product = await getProductById(productId);
  if (!product) {
    throw new Error("\xDCr\xFCn bulunamad\u0131.");
  }
  const db = await getDb();
  const settings = await getUserSettings();
  const offers = product.offers || [];
  let successfulOffersCount = 0;
  let failedOffersCount = 0;
  let priceDropsDetected = 0;
  const notificationsTriggered = [];
  const previousLowestPrice = product.current_lowest_price;
  const previousLowestStore = product.current_lowest_store;
  for (const offer of offers) {
    const adapter = getStoreAdapterById(offer.store_id);
    if (!adapter) continue;
    const details = await adapter.getProductDetails(offer.url);
    const checkTime = (/* @__PURE__ */ new Date()).toISOString();
    if (!details.isVerifiedFromPage || details.price === null) {
      failedOffersCount++;
      db.run(
        `UPDATE offers
         SET price_status = CASE WHEN price IS NOT NULL THEN 'last_known' ELSE 'failed' END,
             checked_at = ?,
             last_error = ?
         WHERE id = ?`,
        [
          checkTime,
          "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.",
          offer.id
        ]
      );
      continue;
    }
    const validation = validatePriceData({
      newPrice: details.price,
      referencePrice: offer.price || previousLowestPrice,
      currency: details.currency,
      isProductPage: true,
      isBundleMismatch: Boolean(details.specs.isBundle) !== Boolean(product.name.toLowerCase().includes("paket"))
    });
    if (!validation.isValid) {
      failedOffersCount++;
      db.run(
        `UPDATE offers SET price_status = 'failed', checked_at = ?, last_error = ? WHERE id = ?`,
        [checkTime, validation.reason || "Ge\xE7ersiz fiyat verisi", offer.id]
      );
      continue;
    }
    if (validation.isSuspicious) {
      db.run(
        `UPDATE offers
         SET price_status = 'suspicious',
             suspicious_price = ?,
             suspicious_reason = ?,
             checked_at = ?
         WHERE id = ?`,
        [
          details.price,
          validation.reason || "\u015E\xFCpheli fiyat",
          checkTime,
          offer.id
        ]
      );
      await addSystemLog("WARN", "PRICE_CHECK", `\u015E\xFCpheli fiyat tespit edildi: ${product.name} (${details.price} TL)`, {
        offerId: offer.id,
        oldPrice: offer.price,
        suspiciousPrice: details.price
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
        checkTime
      ]
    );
    const outcome = await evaluateOfferChangeAndNotify({
      product,
      offer,
      oldPrice: oldOfferPrice,
      newPrice,
      oldAvailability,
      newAvailability,
      previousLowestPrice,
      previousLowestStore,
      settings
    });
    if (outcome.priceDropped) priceDropsDetected++;
    notificationsTriggered.push(...outcome.notifications);
  }
  persistDb(db);
  await addSystemLog(
    "INFO",
    "PRICE_CHECK",
    `Fiyat kontrol\xFC tamamland\u0131: ${product.name} (${successfulOffersCount} ba\u015Far\u0131l\u0131, ${failedOffersCount} eri\u015Filemedi)`,
    { productId, successfulOffersCount, failedOffersCount }
  );
  return {
    offline: false,
    message: successfulOffersCount > 0 ? `Son kontrol tamamland\u0131 (${successfulOffersCount} ma\u011Faza g\xFCncellendi).` : "Ma\u011Faza sayfalar\u0131 otomatik eri\u015Fimi engelledi. Son bilinen fiyatlar korundu.",
    checkedProductsCount: 1,
    checkedOffersCount: offers.length,
    successfulOffersCount,
    failedOffersCount,
    priceDropsDetected,
    notificationsTriggered,
    checkedAt: now
  };
}
async function checkAllActiveProducts() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const online = await checkInternetConnection();
  if (!online) {
    return {
      offline: true,
      message: "\u0130nternet ba\u011Flant\u0131s\u0131 yok. Fiyat kontrol\xFC daha sonra tekrar denenecek.",
      checkedProductsCount: 0,
      checkedOffersCount: 0,
      successfulOffersCount: 0,
      failedOffersCount: 0,
      priceDropsDetected: 0,
      notificationsTriggered: [],
      checkedAt: now
    };
  }
  const allProducts = await getAllProducts();
  const activeProducts = allProducts.filter((p) => p.active);
  let checkedOffersCount = 0;
  let successfulOffersCount = 0;
  let failedOffersCount = 0;
  let priceDropsDetected = 0;
  const notificationsTriggered = [];
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
    message: `${activeProducts.length} \xFCr\xFCn i\xE7in fiyat kontrol\xFC tamamland\u0131.`,
    checkedProductsCount: activeProducts.length,
    checkedOffersCount,
    successfulOffersCount,
    failedOffersCount,
    priceDropsDetected,
    notificationsTriggered,
    checkedAt: now
  };
}
async function evaluateOfferChangeAndNotify(params) {
  const {
    product,
    offer,
    oldPrice,
    newPrice,
    oldAvailability,
    newAvailability,
    previousLowestPrice,
    previousLowestStore,
    settings
  } = params;
  const notifications = [];
  let priceDropped = false;
  if (oldAvailability === "T\xFCkendi" && newAvailability === "Stokta" && settings.notifyOnRestock) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: "restock",
      oldPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }
  if (settings.notifyOnTargetReached && product.target_price && isTargetPriceReached(newPrice, product.target_price)) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: "target_reached",
      oldPrice: oldPrice || previousLowestPrice || newPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }
  if (oldPrice !== null && oldPrice > 0 && newPrice < oldPrice) {
    priceDropped = true;
    const shouldNotify = shouldTriggerPriceDropNotification({
      oldPrice,
      newPrice,
      ruleType: settings.dropRuleType,
      minDropPercent: settings.minDropPercent,
      minDropAmount: settings.minDropAmount
    });
    if (shouldNotify) {
      const isNewLowestStore = previousLowestPrice !== null && newPrice < previousLowestPrice && previousLowestStore !== null && previousLowestStore !== offer.store_name;
      const dispatched = await dispatchNotification({
        productId: product.id,
        productName: product.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: isNewLowestStore ? "new_lowest_store" : "price_drop",
        oldPrice,
        newPrice,
        currency: product.currency,
        productUrl: offer.url
      });
      if (dispatched.notification) notifications.push(dispatched.notification);
    }
  }
  if (oldPrice !== null && oldPrice > 0 && newPrice > oldPrice && settings.notifyOnPriceIncrease) {
    const dispatched = await dispatchNotification({
      productId: product.id,
      productName: product.name,
      storeId: offer.store_id,
      storeName: offer.store_name,
      type: "price_increase",
      oldPrice,
      newPrice,
      currency: product.currency,
      productUrl: offer.url
    });
    if (dispatched.notification) notifications.push(dispatched.notification);
  }
  return { priceDropped, notifications };
}
var globalSchedulerState = globalThis;
function startBackgroundScheduler() {
  if (globalSchedulerState.__fiyatTakipSchedulerTimer) {
    return;
  }
  globalSchedulerState.__fiyatTakipSchedulerTimer = setInterval(async () => {
    if (globalSchedulerState.__fiyatTakipSchedulerRunning) {
      return;
    }
    try {
      const settings = await getUserSettings();
      if (settings.checkFrequency === "manual") return;
      const now = /* @__PURE__ */ new Date();
      const nowMs = now.getTime();
      const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;
      const dateTag = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      const lastRunTs = globalSchedulerState.__fiyatTakipLastScheduledRunTimestamp || 0;
      const lastDateTag = globalSchedulerState.__fiyatTakipLastScheduledDateTag || "";
      let shouldRun = false;
      switch (settings.checkFrequency) {
        case "daily_1":
          if (currentHHMM === settings.preferredCheckTime && lastDateTag !== dateTag) {
            shouldRun = true;
            globalSchedulerState.__fiyatTakipLastScheduledDateTag = dateTag;
          }
          break;
        case "daily_2":
          if (nowMs - lastRunTs >= 12 * 36e5) shouldRun = true;
          break;
        case "daily_4":
        case "every_6h":
          if (nowMs - lastRunTs >= 6 * 36e5) shouldRun = true;
          break;
        case "every_3h":
          if (nowMs - lastRunTs >= 3 * 36e5) shouldRun = true;
          break;
      }
      if (shouldRun) {
        globalSchedulerState.__fiyatTakipSchedulerRunning = true;
        globalSchedulerState.__fiyatTakipLastScheduledRunTimestamp = nowMs;
        try {
          await addSystemLog(
            "INFO",
            "SYSTEM",
            `Zamanlanm\u0131\u015F arka plan fiyat kontrol\xFC ba\u015Flat\u0131ld\u0131 (${settings.checkFrequency})`
          );
          await checkAllActiveProducts();
        } finally {
          globalSchedulerState.__fiyatTakipSchedulerRunning = false;
        }
      }
    } catch (err) {
      globalSchedulerState.__fiyatTakipSchedulerRunning = false;
      console.error("Scheduler error:", err);
    }
  }, 6e4);
}
async function seedDeveloperSampleProducts() {
  const db = await getDb();
  const existing = await getAllProducts();
  if (existing.length > 0) {
    return existing;
  }
  const p1 = await createProductWithOffers({
    name: "Sony WH-1000XM5 Kablosuz G\xFCr\xFClt\xFC Engelleme \xD6zellikli Kulakl\u0131k Siyah",
    brand: "Sony",
    model: "WH-1000XM5",
    productCode: "WH1000XM5B.CE7",
    ean: "4548736132580",
    image: "",
    originalUrl: "https://www.trendyol.com/sony/wh-1000xm5-kablosuz-kulaklik-siyah-p-31245678",
    targetPrice: 9e3,
    currency: "TRY",
    storage: "",
    ram: "",
    color: "Siyah",
    size: "",
    generation: "XM5",
    offers: [
      {
        storeId: "trendyol",
        url: "https://www.trendyol.com/sony/wh-1000xm5-kablosuz-kulaklik-siyah-p-31245678",
        seller: "Trendyol",
        price: 9249,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Kesin e\u015Fle\u015Fme",
        matchScore: 100,
        matchTitle: "Sony WH-1000XM5 Kablosuz G\xFCr\xFClt\xFC Engelleme \xD6zellikli Kulakl\u0131k Siyah",
        priceStatus: "verified"
      },
      {
        storeId: "hepsiburada",
        url: "https://www.hepsiburada.com/sony-wh-1000xm5-kablosuz-kulaklik-siyah-pm-HBC00002abc",
        seller: "Hepsiburada",
        price: 9499,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Kesin e\u015Fle\u015Fme",
        matchScore: 98,
        matchTitle: "Sony WH-1000XM5 Siyah Kablosuz Bluetooth Kulakl\u0131k",
        priceStatus: "verified"
      },
      {
        storeId: "amazon_tr",
        url: "https://www.amazon.com.tr/dp/B09Y2MYL5C",
        seller: "Amazon T\xFCrkiye",
        price: 9799,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Y\xFCksek e\u015Fle\u015Fme",
        matchScore: 92,
        matchTitle: "Sony WH-1000XM5 G\xFCr\xFClt\xFC Engelleyici Kablosuz Kulakl\u0131k, Siyah",
        priceStatus: "verified"
      }
    ]
  });
  const trendyolOffer = p1.offers?.find((o) => o.store_id === "trendyol");
  if (trendyolOffer) {
    db.run(`UPDATE offers SET previous_price = 10499 WHERE id = ?`, [trendyolOffer.id]);
    db.run(`DELETE FROM price_history WHERE product_id = ?`, [p1.id]);
    const timeline = [
      { daysAgo: 28, price: 10499, oldPrice: null },
      { daysAgo: 24, price: 10199, oldPrice: 10499 },
      { daysAgo: 19, price: 9999, oldPrice: 10199 },
      { daysAgo: 9, price: 9499, oldPrice: 9999 },
      { daysAgo: 0, price: 9249, oldPrice: 9499 }
    ];
    for (const pt of timeline) {
      const ts = new Date(Date.now() - pt.daysAgo * 24 * 36e5).toISOString();
      const hid = `ph_seed_${pt.daysAgo}_${Math.random().toString(36).slice(2, 7)}`;
      db.run(
        `INSERT INTO price_history (
          id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
        ) VALUES (?, ?, ?, 'trendyol', ?, ?, 'TRY', 'Stokta', 0, ?)`,
        [hid, trendyolOffer.id, p1.id, pt.price, pt.oldPrice, ts]
      );
    }
  }
  const p2 = await createProductWithOffers({
    name: "Apple iPhone 16 128 GB Siyah",
    brand: "Apple",
    model: "IPHONE 16",
    productCode: "MYE73TU/A",
    ean: "195949821905",
    image: "",
    originalUrl: "https://www.hepsiburada.com/apple-iphone-16-128-gb-siyah-pm-HBC00006XYZ",
    targetPrice: 58e3,
    currency: "TRY",
    storage: "128 GB",
    ram: "8 GB",
    color: "Siyah",
    size: "",
    generation: "iphone 16",
    offers: [
      {
        storeId: "hepsiburada",
        url: "https://www.hepsiburada.com/apple-iphone-16-128-gb-siyah-pm-HBC00006XYZ",
        seller: "Hepsiburada",
        price: 59999,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Kesin e\u015Fle\u015Fme",
        matchScore: 100,
        matchTitle: "Apple iPhone 16 128 GB Siyah",
        priceStatus: "verified"
      },
      {
        storeId: "trendyol",
        url: "https://www.trendyol.com/apple/iphone-16-128-gb-siyah-p-85412369",
        seller: "Trendyol",
        price: 60499,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Kesin e\u015Fle\u015Fme",
        matchScore: 98,
        matchTitle: "Apple iPhone 16 128 GB Siyah Cep Telefonu (Apple T\xFCrkiye Garantili)",
        priceStatus: "verified"
      },
      {
        storeId: "mediamarkt",
        url: "https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-256-gb-siyah-123456.html",
        seller: "MediaMarkt T\xFCrkiye",
        price: 64999,
        currency: "TRY",
        availability: "Stokta",
        matchConfidence: "Benzer \xFCr\xFCn",
        matchScore: 68,
        matchTitle: "Apple iPhone 16 256 GB Siyah (Farkl\u0131 Kapasite \u2014 Otomatik Kar\u015F\u0131la\u015Ft\u0131rma D\u0131\u015F\u0131)",
        priceStatus: "verified"
      }
    ]
  });
  const hbOffer = p2.offers?.find((o) => o.store_id === "hepsiburada");
  if (hbOffer) {
    db.run(`UPDATE offers SET previous_price = 62999 WHERE id = ?`, [hbOffer.id]);
    const tsOld = new Date(Date.now() - 14 * 24 * 36e5).toISOString();
    db.run(
      `INSERT INTO price_history (
        id, offer_id, product_id, store_id, price, old_price, currency, availability, is_suspicious, checked_at
      ) VALUES (?, ?, ?, 'hepsiburada', 62999, NULL, 'TRY', 'Stokta', 0, ?)`,
      [`ph_seed_ip16_old`, hbOffer.id, p2.id, tsOld]
    );
  }
  await updateStoreStatus({ storeId: "trendyol", status: "operational" });
  await updateStoreStatus({ storeId: "hepsiburada", status: "operational" });
  await updateStoreStatus({ storeId: "amazon_tr", status: "operational" });
  await updateStoreStatus({ storeId: "mediamarkt", status: "operational" });
  persistDb(db);
  await dispatchNotification({
    productId: p1.id,
    productName: p1.name,
    storeId: "trendyol",
    storeName: "Trendyol",
    type: "price_drop",
    oldPrice: 10499,
    newPrice: 9249,
    currency: "TRY",
    productUrl: p1.original_url
  });
  return getAllProducts();
}
async function runDeveloperSimulation(params) {
  const db = await getDb();
  let products = await getAllProducts();
  if (products.length === 0) {
    products = await seedDeveloperSampleProducts();
  }
  const targetProduct = (params.productId ? products.find((p) => p.id === params.productId) : products[0]) || products[0];
  const offer = targetProduct.offers?.[0];
  if (!offer) {
    throw new Error("Sim\xFClasyon i\xE7in \xFCr\xFCne ait ma\u011Faza teklifi bulunamad\u0131.");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const currentPrice = offer.price || 1e4;
  const settings = await getUserSettings();
  switch (params.simulationType) {
    case "price_drop": {
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
          now
        ]
      );
      persistDb(db);
      const notif = await dispatchNotification({
        productId: targetProduct.id,
        productName: targetProduct.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: "price_drop",
        oldPrice: currentPrice,
        newPrice,
        currency: targetProduct.currency,
        productUrl: offer.url
      });
      return {
        message: `[Geli\u015Ftirici Modu] Fiyat d\xFC\u015F\xFC\u015F\xFC sim\xFCle edildi: ${currentPrice.toLocaleString("tr-TR")} TL \u2192 ${newPrice.toLocaleString("tr-TR")} TL`,
        notification: notif.notification
      };
    }
    case "price_increase": {
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
          now
        ]
      );
      persistDb(db);
      let notification = null;
      if (settings.notifyOnPriceIncrease) {
        const res = await dispatchNotification({
          productId: targetProduct.id,
          productName: targetProduct.name,
          storeId: offer.store_id,
          storeName: offer.store_name,
          type: "price_increase",
          oldPrice: currentPrice,
          newPrice,
          currency: targetProduct.currency,
          productUrl: offer.url
        });
        notification = res.notification;
      }
      return {
        message: `[Geli\u015Ftirici Modu] Fiyat art\u0131\u015F\u0131 kaydedildi: ${currentPrice.toLocaleString("tr-TR")} TL \u2192 ${newPrice.toLocaleString("tr-TR")} TL (Normal fiyat d\xFC\u015F\xFC\u015F bildirimi tetiklenmedi).`,
        notification
      };
    }
    case "target_reached": {
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
          now
        ]
      );
      persistDb(db);
      const notif = await dispatchNotification({
        productId: targetProduct.id,
        productName: targetProduct.name,
        storeId: offer.store_id,
        storeName: offer.store_name,
        type: "target_reached",
        oldPrice: currentPrice,
        newPrice,
        currency: targetProduct.currency,
        productUrl: offer.url
      });
      return {
        message: `[Geli\u015Ftirici Modu] \u{1F3AF} Hedef fiyat\u0131n\u0131za ula\u015F\u0131ld\u0131! (${newPrice.toLocaleString("tr-TR")} TL <= Hedef ${targetPrice.toLocaleString("tr-TR")} TL)`,
        notification: notif.notification
      };
    }
    case "out_of_stock": {
      db.run(
        `UPDATE offers SET availability = 'T\xFCkendi', checked_at = ? WHERE id = ?`,
        [now, offer.id]
      );
      persistDb(db);
      return {
        message: `[Geli\u015Ftirici Modu] "${targetProduct.name}" durumu 'T\xFCkendi' olarak i\u015Faretlendi. Son bilinen fiyat (${currentPrice.toLocaleString("tr-TR")} TL) korundu.`,
        notification: null
      };
    }
    case "restock": {
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
        type: "restock",
        oldPrice: currentPrice,
        newPrice: currentPrice,
        currency: targetProduct.currency,
        productUrl: offer.url,
        bypassDeduplication: true
      });
      return {
        message: `[Geli\u015Ftirici Modu] "${targetProduct.name}" yeniden stokta olarak i\u015Faretlendi ve bildirim g\xF6nderildi.`,
        notification: notif.notification
      };
    }
    case "store_failure": {
      await updateStoreStatus({
        storeId: offer.store_id,
        status: "unavailable",
        error: "Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi."
      });
      db.run(
        `UPDATE offers SET price_status = 'last_known', last_error = 'Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.', checked_at = ? WHERE id = ?`,
        [now, offer.id]
      );
      persistDb(db);
      await addSystemLog(
        "ERROR",
        "STORE_ERROR",
        `[Sim\xFClasyon] ${offer.store_name} ma\u011Fazas\u0131 eri\u015Filemez durumda: Bu ma\u011Fazan\u0131n fiyat\u0131 \u015Fu anda kontrol edilemedi.`
      );
      return {
        message: `[Geli\u015Ftirici Modu] ${offer.store_name} ma\u011Faza hatas\u0131 sim\xFCle edildi. Son bilinen fiyat korundu, sahte fiyat \xFCretilmedi.`,
        notification: null
      };
    }
    case "suspicious_price": {
      const suspiciousPrice = 10;
      db.run(
        `UPDATE offers
         SET price_status = 'suspicious',
             suspicious_price = ?,
             suspicious_reason = ?,
             checked_at = ?
         WHERE id = ?`,
        [
          suspiciousPrice,
          `\u015E\xFCpheli fiyat: Normal fiyat (${currentPrice.toLocaleString("tr-TR")} TL) iken 10 TL alg\u0131land\u0131. Otomatik bildirim engellendi.`,
          now,
          offer.id
        ]
      );
      persistDb(db);
      await addSystemLog(
        "WARN",
        "PRICE_CHECK",
        `\u015E\xFCpheli fiyat engellendi: ${targetProduct.name} (${currentPrice} TL -> 10 TL)`
      );
      return {
        message: `[Geli\u015Ftirici Modu] \u015E\xFCpheli fiyat (10 TL) alg\u0131land\u0131 ve '\u015E\xFCpheli fiyat' olarak i\u015Faretlendi. Yanl\u0131\u015F fiyat d\xFC\u015F\xFC\u015F\xFC bildirimi engellendi.`,
        notification: null
      };
    }
  }
}

// server.ts
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
async function startServer() {
  await getDb();
  startBackgroundScheduler();
  const app = express();
  const port = Number(process.env.PORT) || 3e3;
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", (req, res, next) => {
    const allowedOrigin = process.env.CORS_ORIGIN || "*";
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "FiyatTakip",
      environment: process.env.NODE_ENV || "development"
    });
  });
  app.get("/api/bootstrap", async (_req, res) => {
    try {
      const [products, stores, notifications, priceDrops, settings, online] = await Promise.all([
        getAllProducts(),
        getAllStores(),
        getAllNotifications(),
        getAllPriceDrops(),
        getUserSettings(),
        checkInternetConnection()
      ]);
      res.json({
        products,
        stores,
        notifications,
        priceDrops,
        settings,
        online,
        serverTime: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      console.error("Bootstrap error:", err);
      res.status(500).json({
        error: "Uygulama verileri y\xFCklenirken bir hata olu\u015Ftu."
      });
    }
  });
  app.post("/api/products/analyze", async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "L\xFCtfen ge\xE7erli bir \xFCr\xFCn ba\u011Flant\u0131s\u0131 girin." });
        return;
      }
      const candidate = await analyzeProductUrl(url);
      res.json({ candidate });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "\xDCr\xFCn bilgileri al\u0131namad\u0131. Ma\u011Faza sayfas\u0131 \u015Fu anda eri\u015Filebilir olmayabilir.";
      res.status(400).json({ error: msg });
    }
  });
  app.post("/api/products", async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.originalUrl) {
        res.status(400).json({ error: "\xDCr\xFCn ad\u0131 ve orijinal ba\u011Flant\u0131 zorunludur." });
        return;
      }
      const created = await createProductWithOffers({
        name: String(body.name),
        brand: String(body.brand || ""),
        model: String(body.model || ""),
        productCode: String(body.productCode || ""),
        ean: String(body.ean || ""),
        image: String(body.image || ""),
        originalUrl: String(body.originalUrl),
        targetPrice: body.targetPrice !== null && body.targetPrice !== void 0 && Number(body.targetPrice) > 0 ? Number(body.targetPrice) : null,
        currency: body.currency || "TRY",
        storage: String(body.storage || ""),
        ram: String(body.ram || ""),
        color: String(body.color || ""),
        size: String(body.size || ""),
        generation: String(body.generation || ""),
        offers: Array.isArray(body.offers) ? body.offers : []
      });
      res.json({ product: created });
    } catch (err) {
      console.error("Create product error:", err);
      res.status(500).json({ error: "\xDCr\xFCn takibe eklenirken bir hata olu\u015Ftu." });
    }
  });
  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await getProductById(req.params.id);
      if (!product) {
        res.status(404).json({ error: "\xDCr\xFCn bulunamad\u0131." });
        return;
      }
      const days = req.query.days ? Number(req.query.days) : void 0;
      const history = await getProductPriceHistory(req.params.id, days);
      res.json({ product, history });
    } catch {
      res.status(500).json({ error: "\xDCr\xFCn detaylar\u0131 al\u0131namad\u0131." });
    }
  });
  app.patch("/api/products/:id", async (req, res) => {
    try {
      const updated = await updateProductSettings(req.params.id, {
        targetPrice: req.body.targetPrice,
        active: req.body.active,
        name: req.body.name
      });
      res.json({ product: updated });
    } catch {
      res.status(500).json({ error: "\xDCr\xFCn ayarlar\u0131 g\xFCncellenemedi." });
    }
  });
  app.delete("/api/products/:id", async (req, res) => {
    try {
      await deleteProduct(req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "\xDCr\xFCn silinemedi." });
    }
  });
  app.post("/api/products/:id/check", async (req, res) => {
    try {
      const summary = await checkSingleProductPrices(req.params.id);
      const product = await getProductById(req.params.id);
      const history = await getProductPriceHistory(req.params.id);
      res.json({ summary, product, history });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "\xDCr\xFCn bilgileri al\u0131namad\u0131. Ma\u011Faza sayfas\u0131 \u015Fu anda eri\u015Filebilir olmayabilir."
      });
    }
  });
  app.post("/api/check-all", async (_req, res) => {
    try {
      const summary = await checkAllActiveProducts();
      res.json({ summary });
    } catch {
      res.status(500).json({ error: "Toplu fiyat kontrol\xFC s\u0131ras\u0131nda hata olu\u015Ftu." });
    }
  });
  app.post("/api/offers/:offerId/resolve-suspicious", async (req, res) => {
    try {
      const action = req.body.action === "approve" ? "approve" : "reject";
      await resolveSuspiciousOfferPrice(req.params.offerId, action);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "\u015E\xFCpheli fiyat i\u015Flemi tamamlanamad\u0131." });
    }
  });
  app.patch("/api/stores/:id", async (req, res) => {
    try {
      const stores = await getAllStores();
      const target = stores.find((s) => s.id === req.params.id);
      if (!target) {
        res.status(404).json({ error: "Ma\u011Faza bulunamad\u0131." });
        return;
      }
      await updateStoreStatus({
        storeId: req.params.id,
        status: target.status,
        enabled: Boolean(req.body.enabled)
      });
      res.json({ stores: await getAllStores() });
    } catch {
      res.status(500).json({ error: "Ma\u011Faza durumu g\xFCncellenemedi." });
    }
  });
  app.post("/api/stores/:id/health-check", async (req, res) => {
    try {
      const adapter = getStoreAdapterById(req.params.id);
      if (!adapter) {
        res.status(404).json({ error: "Ma\u011Faza adapt\xF6r\xFC bulunamad\u0131." });
        return;
      }
      const check = await adapter.healthCheck();
      res.json({ check, stores: await getAllStores() });
    } catch {
      res.status(500).json({ error: "Ma\u011Faza ba\u011Flant\u0131 testi ba\u015Far\u0131s\u0131z oldu." });
    }
  });
  app.post("/api/notifications/mark-read", async (req, res) => {
    try {
      await markNotificationsRead(req.body?.id);
      res.json({ notifications: await getAllNotifications() });
    } catch {
      res.status(500).json({ error: "Bildirimler g\xFCncellenemedi." });
    }
  });
  app.post("/api/notifications/test", async (_req, res) => {
    try {
      const dispatched = await dispatchNotification({
        productId: null,
        productName: "Sony WH-1000XM5 Kablosuz Kulakl\u0131k",
        storeId: "trendyol",
        storeName: "Trendyol",
        type: "test",
        oldPrice: 10499,
        newPrice: 9249,
        currency: "TRY",
        productUrl: "https://www.trendyol.com",
        customTitle: "Fiyat D\xFC\u015Ft\xFC! (Test Bildirimi)",
        customMessage: "Sony WH-1000XM5 \xB7 10.499 TL \u2192 9.249 TL \xB7 D\xFC\u015F\xFC\u015F: 1.250 TL (%11,91) \xB7 Ma\u011Faza: Trendyol",
        bypassDeduplication: true
      });
      res.json({ dispatched, notifications: await getAllNotifications() });
    } catch {
      res.status(500).json({ error: "Test bildirimi g\xF6nderilemedi." });
    }
  });
  app.put("/api/settings", async (req, res) => {
    try {
      const settings = await updateUserSettings(req.body || {});
      res.json({ settings });
    } catch {
      res.status(500).json({ error: "Ayarlar kaydedilemedi." });
    }
  });
  app.get("/api/logs", async (req, res) => {
    try {
      const category = req.query.category ? String(req.query.category) : void 0;
      const logs = await getSystemLogs(250, category);
      res.json({ logs });
    } catch {
      res.status(500).json({ error: "Teknik g\xFCnl\xFCk kay\u0131tlar\u0131 al\u0131namad\u0131." });
    }
  });
  app.delete("/api/logs", async (_req, res) => {
    try {
      await clearSystemLogs();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Teknik g\xFCnl\xFCk temizlenemedi." });
    }
  });
  app.get("/api/data/export-json", async (_req, res) => {
    try {
      const backup = await exportDatabaseBackup();
      res.json(backup);
    } catch {
      res.status(500).json({ error: "Yedek olu\u015Fturulamad\u0131." });
    }
  });
  app.post("/api/data/import-json", async (req, res) => {
    try {
      const { backup, overwrite } = req.body || {};
      const result = await importDatabaseBackup(backup || {}, Boolean(overwrite));
      res.json({ result });
    } catch {
      res.status(400).json({ error: "Yedek dosyas\u0131 ge\xE7ersiz veya geri y\xFCklenemedi." });
    }
  });
  app.post("/api/data/clear", async (_req, res) => {
    try {
      await clearAllData();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Veriler temizlenemedi." });
    }
  });
  app.post("/api/dev/seed-samples", async (_req, res) => {
    try {
      const products = await seedDeveloperSampleProducts();
      res.json({ products });
    } catch {
      res.status(500).json({ error: "\xD6rnek geli\u015Ftirici verileri olu\u015Fturulamad\u0131." });
    }
  });
  app.post("/api/dev/simulate", async (req, res) => {
    try {
      const { simulationType, productId } = req.body || {};
      const outcome = await runDeveloperSimulation({
        simulationType,
        productId
      });
      res.json(outcome);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Sim\xFClasyon \xE7al\u0131\u015Ft\u0131r\u0131lamad\u0131."
      });
    }
  });
  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "\u0130stenen API u\xE7 noktas\u0131 bulunamad\u0131." });
  });
  app.use((err, req, res, next) => {
    console.error("Express error:", err);
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.path.startsWith("/api")) {
      res.status(500).json({
        error: "Sunucu taraf\u0131nda beklenmeyen bir hata olu\u015Ftu."
      });
      return;
    }
    next(err);
  });
  const distPath = path3.join(process.cwd(), "dist");
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexFile = path3.join(distPath, "index.html");
      if (fs3.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(503).send('\xD6ny\xFCz derlemesi (dist/index.html) bulunamad\u0131. L\xFCtfen \xF6nce "npm run build:web" komutunu \xE7al\u0131\u015Ft\u0131r\u0131n.');
      }
    });
  }
  app.listen(port, "0.0.0.0", () => {
    console.log(`Fiyat Takip Agent sunucusu \xE7al\u0131\u015F\u0131yor: http://0.0.0.0:${port}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start Fiyat Takip Agent server:", err);
  process.exit(1);
});
