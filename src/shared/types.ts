/**
 * Core domain types for Fiyat Takip Agent
 */

export type CurrencyCode = 'TRY' | 'USD' | 'EUR' | 'GBP';

export type AvailabilityState = 'Stokta' | 'Tükendi' | 'Bilinmiyor';

export type MatchConfidence =
  | 'Kesin eşleşme'
  | 'Yüksek eşleşme'
  | 'Benzer ürün'
  | 'Farklı ürün';

export type PriceStatus = 'verified' | 'last_known' | 'failed' | 'suspicious';

export type StoreConnectionStatus = 'operational' | 'unavailable' | 'unknown';

export type CheckFrequency =
  | 'daily_1'
  | 'daily_2'
  | 'daily_4'
  | 'every_6h'
  | 'every_3h'
  | 'manual';

export type PriceDropRuleType = 'any' | 'percent' | 'amount' | 'both';

export type NotificationType =
  | 'price_drop'
  | 'target_reached'
  | 'new_lowest_store'
  | 'restock'
  | 'price_increase'
  | 'test';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export type LogCategory =
  | 'PRICE_CHECK'
  | 'FAILED_CHECK'
  | 'STORE_ERROR'
  | 'NOTIFICATION'
  | 'PRODUCT_MATCH'
  | 'SYSTEM';

export interface ProductSpecs {
  brand: string;
  manufacturer?: string;
  model: string;
  modelNumber?: string;
  sku?: string;
  ean?: string;
  upc?: string;
  productCode?: string;
  storage?: string;
  ram?: string;
  color?: string;
  size?: string;
  generation?: string;
  variantTier?: string; // e.g., Pro, Max, Plus, Ultra, Mini, Air
  isBundle?: boolean;
  isAccessory?: boolean;
}

export interface ProductRecord {
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
  active: boolean;
  // Computed / aggregated fields for UI
  current_lowest_price: number | null;
  current_lowest_store: string | null;
  previous_lowest_price: number | null;
  initial_price: number | null;
  price_change_amount: number | null;
  price_change_percent: number | null;
  last_checked_at: string | null;
  availability_summary: AvailabilityState;
  has_suspicious_price: boolean;
  offers?: OfferRecord[];
}

export interface StoreRecord {
  id: string;
  name: string;
  domain: string;
  enabled: boolean;
  status: StoreConnectionStatus;
  last_successful_check: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  tracked_offers_count?: number;
}

export interface OfferRecord {
  id: string;
  product_id: string;
  store_id: string;
  store_name: string;
  store_domain: string;
  url: string;
  seller: string;
  price: number | null;
  previous_price: number | null;
  currency: CurrencyCode;
  availability: AvailabilityState;
  match_confidence: MatchConfidence;
  match_score: number;
  match_title: string;
  price_status: PriceStatus;
  suspicious_price: number | null;
  suspicious_reason: string | null;
  checked_at: string | null;
  last_error: string | null;
}

export interface PriceHistoryRecord {
  id: string;
  offer_id: string;
  product_id: string;
  store_id: string;
  store_name: string;
  price: number;
  old_price: number | null;
  currency: CurrencyCode;
  availability: AvailabilityState;
  is_suspicious: boolean;
  checked_at: string;
}

export interface NotificationRecord {
  id: string;
  product_id: string | null;
  product_name?: string;
  product_image?: string;
  store_id: string | null;
  store_name: string;
  type: NotificationType;
  title: string;
  message: string;
  old_price: number | null;
  new_price: number | null;
  drop_amount: number | null;
  drop_percent: number | null;
  currency: CurrencyCode;
  product_url: string;
  created_at: string;
  sent: boolean;
  read: boolean;
  dedup_key: string;
}

export interface SystemLogRecord {
  id: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details: string;
  created_at: string;
}

export interface UserSettings {
  theme: 'light' | 'dark';
  language: 'tr';
  runInBackground: boolean;
  launchAtStartup: boolean;
  firstRunCompleted: boolean;
  devModeEnabled: boolean;
  // Price Check Settings
  checkFrequency: CheckFrequency;
  preferredCheckTime: string; // e.g. "09:00"
  dropRuleType: PriceDropRuleType;
  minDropPercent: number;
  minDropAmount: number;
  notifyOnTargetReached: boolean;
  notifyOnRestock: boolean;
  notifyOnPriceIncrease: boolean;
  // Notification Channels
  macosNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  emailRecipient: string;
  emailSmtpHost: string;
  emailSmtpPort: number;
  emailSmtpUser: string;
  emailSmtpPasswordSet: boolean; // Never expose plaintext password to frontend
  telegramNotificationsEnabled: boolean;
  telegramBotTokenSet: boolean; // Stored encrypted on backend
  telegramBotTokenMasked: string;
  telegramChatId: string;
}

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

export interface AnalyzedProductCandidate {
  url: string;
  normalizedUrl: string;
  storeId: string;
  storeName: string;
  name: string;
  brand: string;
  model: string;
  productCode: string;
  ean: string;
  price: number | null;
  currency: CurrencyCode;
  seller: string;
  availability: AvailabilityState;
  image: string;
  specs: ProductSpecs;
  extractionStatus: 'verified' | 'blocked_or_unavailable';
  extractionMessage?: string;
  otherStoreOffers: Array<{
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
  }>;
}
