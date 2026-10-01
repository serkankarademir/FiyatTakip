import { execFile } from 'child_process';
import { formatPriceTR } from '../shared/priceUtils';
import {
  CurrencyCode,
  NotificationRecord,
  NotificationType,
} from '../shared/types';
import {
  addSystemLog,
  getDecryptedCredentials,
  getUserSettings,
  insertNotificationRecord,
} from './database';

export interface TriggerNotificationInput {
  productId: string | null;
  productName: string;
  storeId: string | null;
  storeName: string;
  type: NotificationType;
  oldPrice: number | null;
  newPrice: number | null;
  currency?: CurrencyCode;
  productUrl: string;
  customTitle?: string;
  customMessage?: string;
  bypassDeduplication?: boolean;
}

/**
 * Triggers native macOS notification (when running on macOS) and optional Telegram / Email notifications.
 * Enforces strict deduplication so repeated checks at the same price never spam the user.
 */
export async function dispatchNotification(
  input: TriggerNotificationInput
): Promise<{
  created: boolean;
  notification: NotificationRecord | null;
  channelsDispatched: string[];
  errors: string[];
}> {
  const settings = await getUserSettings();
  const currency = input.currency || 'TRY';

  let dropAmount: number | null = null;
  let dropPercent: number | null = null;

  if (
    input.oldPrice !== null &&
    input.newPrice !== null &&
    input.oldPrice > 0 &&
    input.newPrice > 0
  ) {
    dropAmount = Math.round((input.oldPrice - input.newPrice) * 100) / 100;
    dropPercent = Math.round(((input.oldPrice - input.newPrice) / input.oldPrice) * 10000) / 100;
  }

  let title = input.customTitle || 'Fiyat Düştü!';
  let message = input.customMessage || '';

  if (!input.customTitle || !input.customMessage) {
    switch (input.type) {
      case 'target_reached':
        title = '🎯 Hedef fiyatınıza ulaşıldı!';
        message = `${input.productName} — ${formatPriceTR(input.newPrice, currency, false)} (${input.storeName})`;
        break;
      case 'price_drop':
      case 'new_lowest_store': {
        title = input.type === 'new_lowest_store' ? 'Yeni En Düşük Mağaza Fiyatı!' : 'Fiyat Düştü!';
        const absDrop = dropAmount ? formatPriceTR(Math.abs(dropAmount), currency, false) : '';
        const absPct = dropPercent ? `%${Math.abs(dropPercent).toLocaleString('tr-TR')}` : '';
        message = `${input.productName}\n${formatPriceTR(input.oldPrice, currency, false)} → ${formatPriceTR(input.newPrice, currency, false)}\nDüşüş: ${absDrop} (${absPct}) · Mağaza: ${input.storeName}`;
        break;
      }
      case 'restock':
        title = 'Ürün Tekrar Stokta!';
        message = `${input.productName} yeniden stoklara girdi (${formatPriceTR(input.newPrice, currency, false)} — ${input.storeName}).`;
        break;
      case 'price_increase':
        title = 'Fiyat Artışı Tespit Edildi';
        message = `${input.productName}: ${formatPriceTR(input.oldPrice, currency, false)} → ${formatPriceTR(input.newPrice, currency, false)} (${input.storeName})`;
        break;
      case 'test':
        title = input.customTitle || 'Fiyat Takip Agent — Test Bildirimi';
        message =
          input.customMessage ||
          'Fiyat Düştü! Sony WH-1000XM5 · 10.499 TL → 9.249 TL · Düşüş: 1.250 TL (%11,91) · Mağaza: Trendyol';
        break;
    }
  }

  // Deduplication key: Product + Store + Type + Exact New Price (Section 42)
  const dedupKey = input.bypassDeduplication
    ? ''
    : `${input.productId || 'sys'}:${input.storeId || 'any'}:${input.type}:${input.newPrice ?? 'na'}`;

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
    dedupKey,
  });

  if (!record) {
    return {
      created: false,
      notification: null,
      channelsDispatched: [],
      errors: [],
    };
  }

  const channelsDispatched: string[] = [];
  const errors: string[] = [];

  // 1. Native macOS Notification (via osascript when running on Darwin / macOS)
  if (settings.macosNotificationsEnabled) {
    channelsDispatched.push('macOS Bildirimi');
    if (process.platform === 'darwin') {
      try {
        const cleanTitle = title.replace(/"/g, '\\"');
        const cleanMsg = message.replace(/\n/g, ' · ').replace(/"/g, '\\"');
        execFile('osascript', [
          '-e',
          `display notification "${cleanMsg}" with title "Fiyat Takip Agent" subtitle "${cleanTitle}" sound name "Glass"`,
        ]);
      } catch (err) {
        errors.push(`macOS yerel bildirim hatası: ${String(err)}`);
      }
    }
  }

  // 2. Optional Telegram Notification (Section 13)
  if (settings.telegramNotificationsEnabled && settings.telegramChatId) {
    const creds = await getDecryptedCredentials();
    if (creds.telegramBotToken) {
      try {
        const tgText = `🔔 *${title}*\n\n📦 *Ürün:* ${input.productName}\n🏬 *Mağaza:* ${input.storeName}\n${
          input.oldPrice && input.newPrice
            ? `💰 *Fiyat:* ${formatPriceTR(input.oldPrice, currency, false)} → *${formatPriceTR(input.newPrice, currency, false)}*\n`
            : ''
        }${
          dropAmount && dropAmount > 0
            ? `📉 *Düşüş:* ${formatPriceTR(dropAmount, currency, false)} (%${dropPercent?.toLocaleString('tr-TR')})\n`
            : ''
        }${input.productUrl ? `\n🔗 [Ürünü Aç](${input.productUrl})` : ''}`;

        const tgRes = await fetch(
          `https://api.telegram.org/bot${creds.telegramBotToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: settings.telegramChatId,
              text: tgText,
              parse_mode: 'Markdown',
              disable_web_page_preview: false,
            }),
          }
        );

        if (tgRes.ok) {
          channelsDispatched.push('Telegram');
        } else {
          const errBody = await tgRes.text();
          errors.push(`Telegram bildirimi gönderilemedi: ${errBody.slice(0, 120)}`);
        }
      } catch (err) {
        errors.push(`Telegram bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. Optional Email Notification (Section 13)
  if (settings.emailNotificationsEnabled && settings.emailRecipient) {
    channelsDispatched.push(`E-posta (${settings.emailRecipient})`);
    await addSystemLog(
      'INFO',
      'NOTIFICATION',
      `E-posta bildirimi kuyruğa alındı (${settings.emailRecipient}): ${title}`,
      { recipient: settings.emailRecipient, title }
    );
  }

  await addSystemLog(
    errors.length > 0 ? 'WARN' : 'INFO',
    'NOTIFICATION',
    `Bildirim oluşturuldu: ${title} (${input.productName})`,
    { channelsDispatched, errors }
  );

  return {
    created: true,
    notification: record,
    channelsDispatched,
    errors,
  };
}
