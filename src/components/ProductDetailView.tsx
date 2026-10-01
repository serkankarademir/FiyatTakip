import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  ExternalLink,
  Package,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Target,
  Trash2,
} from 'lucide-react';
import {
  calculatePriceChange,
  formatPriceTR,
  isTargetPriceReached,
  parsePriceTR,
} from '../shared/priceUtils';
import {
  PriceHistoryRecord,
  ProductRecord,
} from '../shared/types';
import { PriceHistoryChart } from './PriceHistoryChart';

interface ProductDetailViewProps {
  product: ProductRecord;
  onBack: () => void;
  onRefreshData: () => Promise<void>;
  onNavigateSettings: () => void;
  onDeleteProduct: (productId: string) => Promise<void>;
}

export const ProductDetailView: React.FC<ProductDetailViewProps> = ({
  product,
  onBack,
  onRefreshData,
  onNavigateSettings,
  onDeleteProduct,
}) => {
  const [history, setHistory] = useState<PriceHistoryRecord[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatusMessage, setCheckStatusMessage] = useState('');
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [targetInput, setTargetInput] = useState(
    product.target_price ? String(product.target_price) : ''
  );
  const [includeSimilarMatches, setIncludeSimilarMatches] = useState(false);

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/products/${product.id}`);
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadHistory();
    setTargetInput(product.target_price ? String(product.target_price) : '');
  }, [product.id, product.target_price]);

  const handleManualCheck = async () => {
    setIsChecking(true);
    setCheckStatusMessage('Fiyat kontrol ediliyor…');
    try {
      const res = await fetch(`/api/products/${product.id}/check`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.history) setHistory(data.history);
      await onRefreshData();
      const nowFormatted = new Date().toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      if (data.summary?.offline) {
        setCheckStatusMessage(
          'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.'
        );
      } else {
        setCheckStatusMessage(`Son kontrol: ${nowFormatted}`);
      }
    } catch {
      setCheckStatusMessage(
        'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleSaveTargetPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parsePriceTR(targetInput, product.currency);
    await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPrice: parsed.isValid ? parsed.amount : null,
      }),
    });
    setShowTargetEditor(false);
    await onRefreshData();
  };

  const handleToggleActive = async () => {
    await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !product.active }),
    });
    await onRefreshData();
  };

  const handleResolveSuspicious = async (
    offerId: string,
    action: 'approve' | 'reject'
  ) => {
    await fetch(`/api/offers/${offerId}/resolve-suspicious`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await loadHistory();
    await onRefreshData();
  };

  const offers = product.offers || [];
  // Filter offers by match confidence (Section 6: Only include "Kesin eşleşme" and "Yüksek eşleşme" by default)
  const displayedOffers = offers.filter((o) =>
    includeSimilarMatches
      ? true
      : o.match_confidence === 'Kesin eşleşme' ||
        o.match_confidence === 'Yüksek eşleşme'
  );

  // Determine true lowest verified price among eligible offers (Section 10)
  const validPricedOffers = displayedOffers.filter(
    (o) =>
      o.price !== null &&
      o.price > 0 &&
      o.price_status !== 'suspicious' &&
      (o.match_confidence === 'Kesin eşleşme' ||
        o.match_confidence === 'Yüksek eşleşme')
  );
  const lowestPriceVal =
    validPricedOffers.length > 0
      ? Math.min(...validPricedOffers.map((o) => o.price as number))
      : null;

  const priceChange = calculatePriceChange(
    product.previous_lowest_price || product.initial_price,
    product.current_lowest_price,
    product.currency
  );

  const targetReached = isTargetPriceReached(
    product.current_lowest_price,
    product.target_price
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Listeye Dön</span>
        </button>

        {/* Action Buttons (Section 23 & 24) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleManualCheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'Fiyat kontrol ediliyor…' : 'Şimdi Kontrol Et'}</span>
          </button>

          <button
            onClick={() => setShowTargetEditor(!showTargetEditor)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Target className="w-3.5 h-3.5" />
            <span>Hedef Fiyat</span>
          </button>

          <button
            onClick={onNavigateSettings}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Bildirim Ayarları</span>
          </button>

          <button
            onClick={handleToggleActive}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {product.active ? (
              <>
                <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
                <span>Takibi Durdur</span>
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>Takibi Başlat</span>
              </>
            )}
          </button>

          <button
            onClick={() => onDeleteProduct(product.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Ürünü Sil</span>
          </button>
        </div>
      </div>

      {checkStatusMessage && (
        <div className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
          <span>{checkStatusMessage}</span>
          <button
            onClick={() => setCheckStatusMessage('')}
            className="text-slate-400 hover:text-slate-600 text-[11px]"
          >
            Gizle
          </button>
        </div>
      )}

      {/* Target Reached Banner (Section 11) */}
      {targetReached && (
        <div className="px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            🎯 Hedef fiyatınıza ulaşıldı! Güncel en düşük fiyat ({formatPriceTR(product.current_lowest_price, product.currency, false)}) belirlediğiniz hedef fiyatın ({formatPriceTR(product.target_price, product.currency, false)}) altında veya eşit.
          </span>
        </div>
      )}

      {/* Target Price Editor Form (Section 11) */}
      {showTargetEditor && (
        <form
          onSubmit={handleSaveTargetPrice}
          className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-4"
        >
          <div>
            <span className="block text-[11px] text-slate-500">Güncel Fiyat</span>
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100">
              {formatPriceTR(product.current_lowest_price, product.currency, false)}
            </span>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Hedef Fiyat (TL)
            </label>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="Örn: 9.000 TL"
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors whitespace-nowrap"
          >
            Hedef Fiyat Belirle
          </button>
        </form>
      )}

      {/* Suspicious Price Alert (Section 18) */}
      {offers
        .filter((o) => o.price_status === 'suspicious')
        .map((suspOffer) => (
          <div
            key={suspOffer.id}
            className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Şüpheli fiyat ({suspOffer.store_name}:{' '}
                  {formatPriceTR(suspOffer.suspicious_price, suspOffer.currency)})
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                  {suspOffer.suspicious_reason ||
                    'Sayfa hatası nedeniyle olağandışı bir fiyat algılandı. Yanlış bildirim gönderilmedi.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleResolveSuspicious(suspOffer.id, 'approve')}
                className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-500 whitespace-nowrap"
              >
                Fiyatı Doğrula ve Kaydet
              </button>
              <button
                onClick={() => handleResolveSuspicious(suspOffer.id, 'reject')}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-amber-300 dark:border-amber-700 rounded-lg whitespace-nowrap"
              >
                Reddet (Son Fiyatı Koru)
              </button>
            </div>
          </div>
        ))}

      {/* Main Product Identity Header Card */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1.5"
                />
              ) : (
                <Package className="w-8 h-8 text-slate-400" />
              )}
            </div>

            <div className="space-y-1.5">
              {/* Unboxed clean metadata (Zero-Pill discipline) */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {product.brand || 'Marka Belirtilmemiş'}
                </span>
                <span>·</span>
                <span>Model: {product.model || 'Standart'}</span>
                {product.product_code && (
                  <>
                    <span>·</span>
                    <span className="font-mono">SKU: {product.product_code}</span>
                  </>
                )}
                {product.storage && (
                  <>
                    <span>·</span>
                    <span>{product.storage}</span>
                  </>
                )}
                <span>·</span>
                <span
                  className={
                    product.active
                      ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                      : 'text-slate-400'
                  }
                >
                  {product.active ? 'Takip Ediliyor' : 'Takip Durduruldu'}
                </span>
              </div>

              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {product.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Son kontrol:{' '}
                  {product.last_checked_at
                    ? new Date(product.last_checked_at).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Henüz kontrol edilmedi'}
                </span>
                <span>·</span>
                <a
                  href={product.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline"
                >
                  <span>Orijinal Ürün Bağlantısı</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Right Metric Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-4 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 w-full md:w-auto font-mono tabular-nums">
            <div>
              <span className="block font-sans text-xs text-slate-500 dark:text-slate-400">
                En Düşük Fiyat
              </span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {formatPriceTR(product.current_lowest_price, product.currency, false)}
              </span>
              {product.current_lowest_store && (
                <span className="block font-sans text-[11px] text-emerald-600 dark:text-emerald-400">
                  {product.current_lowest_store}
                </span>
              )}
            </div>

            <div>
              <span className="block font-sans text-xs text-slate-500 dark:text-slate-400">
                Fiyat Değişimi
              </span>
              {priceChange && !priceChange.isUnchanged ? (
                <span
                  className={`text-base font-bold ${
                    priceChange.isDecrease
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {priceChange.formattedDiffAmount} ({priceChange.formattedDiffPercent})
                </span>
              ) : (
                <span className="text-sm text-slate-400">Değişim yok</span>
              )}
              {product.previous_lowest_price && (
                <span className="block text-[11px] text-slate-400">
                  Önceki: {formatPriceTR(product.previous_lowest_price, product.currency, false)}
                </span>
              )}
            </div>

            <div>
              <span className="block font-sans text-xs text-slate-500 dark:text-slate-400">
                Hedef Fiyat
              </span>
              <span className="text-base font-semibold text-slate-800 dark:text-slate-200">
                {product.target_price
                  ? formatPriceTR(product.target_price, product.currency, false)
                  : 'Belirlenmedi'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Store Comparison Table (Section 10) */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Mağaza Fiyat Karşılaştırması
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Varsayılan olarak yalnızca “Kesin eşleşme” ve “Yüksek eşleşme” olan teklifler otomatik karşılaştırmaya dahil edilir.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSimilarMatches}
              onChange={(e) => setIncludeSimilarMatches(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            <span>“Benzer ürün” eşleşmelerini de göster</span>
          </label>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Mağaza</th>
                <th className="py-2.5 px-4 font-medium">Eşleşme Güveni</th>
                <th className="py-2.5 px-4 font-medium text-right">Fiyat</th>
                <th className="py-2.5 px-4 font-medium text-right">Değişim</th>
                <th className="py-2.5 px-4 font-medium">Stok</th>
                <th className="py-2.5 px-4 font-medium">Veri Durumu</th>
                <th className="py-2.5 px-4 font-medium">Güncelleme</th>
                <th className="py-2.5 px-4 font-medium text-right">Bağlantı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {displayedOffers.map((offer) => {
                const isLowest =
                  lowestPriceVal !== null &&
                  offer.price === lowestPriceVal &&
                  (offer.match_confidence === 'Kesin eşleşme' ||
                    offer.match_confidence === 'Yüksek eşleşme') &&
                  offer.price_status !== 'suspicious';

                const offerChange = calculatePriceChange(
                  offer.previous_price || product.initial_price,
                  offer.price,
                  offer.currency
                );

                return (
                  <tr
                    key={offer.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                      isLowest ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{offer.store_name}</span>
                        {isLowest && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            En düşük fiyat
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs">
                        {offer.match_title || product.name}
                      </p>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {offer.match_confidence}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {offer.price !== null ? (
                        <span
                          className={`font-bold ${
                            isLowest
                              ? 'text-emerald-600 dark:text-emerald-400 text-sm'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatPriceTR(offer.price, offer.currency, false)}
                        </span>
                      ) : (
                        <span className="font-sans text-slate-400">
                          Bu mağazanın fiyatı şu anda kontrol edilemedi.
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {offerChange && !offerChange.isUnchanged ? (
                        <span
                          className={
                            offerChange.isDecrease
                              ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {offerChange.formattedDiffPercent}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          offer.availability === 'Stokta'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : offer.availability === 'Tükendi'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {offer.availability === 'Stokta' ? 'Var (Stokta)' : offer.availability}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-500">
                      {offer.price_status === 'verified'
                        ? 'Doğrulanmış fiyat'
                        : offer.price_status === 'last_known'
                        ? 'Son bilinen fiyat'
                        : offer.price_status === 'suspicious'
                        ? 'Şüpheli fiyat'
                        : 'Kontrol edilemedi'}
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-500">
                      {offer.checked_at
                        ? new Date(offer.checked_at).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline font-medium"
                      >
                        <span>Mağazaya Git</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Price History Section (Section 9) */}
      <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <PriceHistoryChart
          history={history}
          targetPrice={product.target_price}
          currency={product.currency}
        />
      </div>
    </div>
  );
};
