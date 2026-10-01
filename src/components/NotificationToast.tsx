import React from 'react';
import { Bell, ExternalLink, X } from 'lucide-react';
import { formatPriceTR } from '../shared/priceUtils';
import { NotificationRecord } from '../shared/types';

interface NotificationToastProps {
  notification: NotificationRecord | null;
  onClose: () => void;
  onOpenProduct?: (productId: string | null, url: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onClose,
  onOpenProduct,
}) => {
  if (!notification) return null;

  return (
    <div
      role="alert"
      className="fixed top-14 right-5 z-50 w-96 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl p-4 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {notification.title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Mağaza: {notification.store_name || 'Trendyol'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Bildirimi kapat"
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2.5 pl-10">
        {notification.product_name && (
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
            {notification.product_name}
          </p>
        )}

        {notification.old_price && notification.new_price ? (
          <div className="mt-1 space-y-0.5 font-mono text-xs tabular-nums">
            <p className="text-slate-700 dark:text-slate-300">
              <span className="line-through text-slate-400">
                {formatPriceTR(notification.old_price, notification.currency, false)}
              </span>{' '}
              →{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatPriceTR(notification.new_price, notification.currency, false)}
              </span>
            </p>
            {notification.drop_amount && notification.drop_amount > 0 && (
              <p className="text-emerald-600 dark:text-emerald-400">
                Düşüş: {formatPriceTR(notification.drop_amount, notification.currency, false)} (%
                {Math.abs(notification.drop_percent || 0).toLocaleString('tr-TR')})
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">
            {notification.message}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => {
              if (onOpenProduct) {
                onOpenProduct(notification.product_id, notification.product_url);
              }
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <span>Ürünü Aç</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
