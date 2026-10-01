import React from 'react';
import {
  Bell,
  ExternalLink,
  Plus,
  RefreshCw,
  TrendingDown,
  X,
} from 'lucide-react';
import { formatPriceTR } from '../shared/priceUtils';
import { ProductRecord } from '../shared/types';

interface MenuBarPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductRecord[];
  isCheckingAll: boolean;
  lastCheckedAt: string | null;
  onCheckAll: () => void;
  onOpenAddModal: () => void;
  onSelectProduct: (productId: string) => void;
}

export const MenuBarPopover: React.FC<MenuBarPopoverProps> = ({
  isOpen,
  onClose,
  products,
  isCheckingAll,
  lastCheckedAt,
  onCheckAll,
  onOpenAddModal,
  onSelectProduct,
}) => {
  if (!isOpen) return null;

  const activeCount = products.filter((p) => p.active).length;
  const recentDrops = products
    .filter((p) => p.price_change_amount !== null && p.price_change_amount < 0)
    .slice(0, 5);

  return (
    <div className="fixed top-12 right-4 z-50 w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Fiyat Takip Agent — Menü Çubuğu
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Kapat"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Summary */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>Aktif Takip: <strong className="text-slate-900 dark:text-slate-100 font-mono">{activeCount}</strong> ürün</span>
        <span className="font-mono">
          {lastCheckedAt
            ? `Son: ${new Date(lastCheckedAt).toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'Henüz kontrol yok'}
        </span>
      </div>

      {/* Recent Drops List */}
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {recentDrops.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400">
            Henüz yeni bir fiyat düşüşü yok. Zamanlayıcı arka planda fiyatları izlemeye devam ediyor.
          </div>
        ) : (
          recentDrops.map((product) => (
            <div
              key={product.id}
              onClick={() => {
                onSelectProduct(product.id);
                onClose();
              }}
              className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                  {product.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                  <span className="text-slate-500">{product.current_lowest_store || '—'}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-0.5 font-mono">
                    <TrendingDown className="w-3 h-3" />%
                    {Math.abs(product.price_change_percent || 0).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 block">
                  {formatPriceTR(product.current_lowest_price, product.currency, false)}
                </span>
                {product.previous_lowest_price && (
                  <span className="text-[10px] font-mono line-through text-slate-400 block">
                    {formatPriceTR(product.previous_lowest_price, product.currency, false)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions Footer */}
      <div className="p-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            onCheckAll();
          }}
          disabled={isCheckingAll}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isCheckingAll ? 'animate-spin' : ''}`} />
          <span>Şimdi Kontrol Et</span>
        </button>
        <button
          onClick={() => {
            onClose();
            onOpenAddModal();
          }}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-[11px] font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90"
        >
          <Plus className="w-3 h-3" />
          <span>+ Ürün Ekle</span>
        </button>
      </div>
    </div>
  );
};
