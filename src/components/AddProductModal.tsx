import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { formatPriceTR, parsePriceTR } from '../shared/priceUtils';
import {
  AnalyzedProductCandidate,
  AvailabilityState,
  CurrencyCode,
  MatchConfidence,
  PriceStatus,
  ProductRecord,
} from '../shared/types';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProductAdded: (product: ProductRecord) => void;
}

type AnalysisStep = 'idle' | 'step1' | 'step2' | 'step3' | 'done' | 'error';

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  onProductAdded,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [step, setStep] = useState<AnalysisStep>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [candidate, setCandidate] = useState<AnalyzedProductCandidate | null>(null);

  // Editable overrides when store blocks automated scraping or user sets target price
  const [customName, setCustomName] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [manualObservedPriceInput, setManualObservedPriceInput] = useState('');
  const [targetPriceInput, setTargetPriceInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!urlInput.trim()) {
      setErrorMessage('Lütfen geçerli bir ürün bağlantısı girin.');
      setStep('error');
      return;
    }

    setErrorMessage('');
    setCandidate(null);
    setStep('step1');

    // Progress indicator timer transitions (Section 7)
    const t1 = setTimeout(() => {
      setStep((prev) => (prev === 'step1' ? 'step2' : prev));
    }, 900);
    const t2 = setTimeout(() => {
      setStep((prev) => (prev === 'step1' || prev === 'step2' ? 'step3' : prev));
    }, 1800);

    try {
      const res = await fetch('/api/products/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      clearTimeout(t1);
      clearTimeout(t2);

      if (!res.ok || !data.candidate) {
        setErrorMessage(
          data.error ||
            'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.'
        );
        setStep('error');
        return;
      }

      const cand: AnalyzedProductCandidate = data.candidate;
      setCandidate(cand);
      setCustomName(cand.name);
      setCustomBrand(cand.brand);
      setCustomModel(cand.model);
      setManualObservedPriceInput(cand.price ? String(cand.price) : '');
      setTargetPriceInput(
        cand.price ? String(Math.round(cand.price * 0.9)) : ''
      );
      setStep('done');
    } catch {
      clearTimeout(t1);
      clearTimeout(t2);
      setErrorMessage(
        'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.'
      );
      setStep('error');
    }
  };

  const handleConfirmAdd = async () => {
    if (!candidate) return;
    setIsSaving(true);

    try {
      const parsedManualPrice = parsePriceTR(manualObservedPriceInput, candidate.currency);
      const primaryPrice =
        candidate.price !== null
          ? candidate.price
          : parsedManualPrice.isValid
          ? parsedManualPrice.amount
          : null;

      const parsedTarget = parsePriceTR(targetPriceInput, candidate.currency);

      const offersPayload: Array<{
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
      }> = [
        {
          storeId: candidate.storeId,
          url: candidate.normalizedUrl,
          seller: candidate.seller || candidate.storeName,
          price: primaryPrice,
          currency: candidate.currency,
          availability: primaryPrice ? 'Stokta' : candidate.availability,
          matchConfidence: 'Kesin eşleşme',
          matchScore: 100,
          matchTitle: customName || candidate.name,
          priceStatus:
            candidate.extractionStatus === 'verified'
              ? 'verified'
              : primaryPrice
              ? 'last_known'
              : 'failed',
          lastError:
            candidate.extractionStatus === 'verified'
              ? null
              : 'Bu mağazanın fiyatı şu anda kontrol edilemedi.',
        },
      ];

      // Include other stores that were checked
      for (const other of candidate.otherStoreOffers) {
        if (other.status === 'verified' && other.price !== null) {
          offersPayload.push({
            storeId: other.storeId,
            url: other.url,
            seller: other.seller,
            price: other.price,
            currency: other.currency,
            availability: other.availability,
            matchConfidence: other.matchConfidence,
            matchScore: other.matchScore,
            matchTitle: other.title,
            priceStatus: 'verified',
            lastError: null,
          });
        }
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName.trim() || candidate.name,
          brand: customBrand.trim() || candidate.brand,
          model: customModel.trim() || candidate.model,
          productCode: candidate.productCode,
          ean: candidate.ean,
          image: candidate.image,
          originalUrl: candidate.normalizedUrl,
          targetPrice: parsedTarget.isValid ? parsedTarget.amount : null,
          currency: candidate.currency,
          storage: candidate.specs.storage || '',
          ram: candidate.specs.ram || '',
          color: candidate.specs.color || '',
          size: candidate.specs.size || '',
          generation: candidate.specs.generation || '',
          offers: offersPayload,
        }),
      });

      const data = await res.json();
      if (res.ok && data.product) {
        onProductAdded(data.product);
        onClose();
      } else {
        setErrorMessage(data.error || 'Ürün takibe eklenemedi.');
      }
    } catch {
      setErrorMessage('Ürün kaydedilirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-xl shadow-2xl overflow-hidden sm:my-8">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Yeni Ürün Takibi Ekle
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              İnternetteki ürün fiyatlarını otomatik takip edin.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto pb-safe">
          <form onSubmit={handleAnalyze} className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="product-url-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Ürün bağlantısını yapıştırın
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setUrlInput(text.trim());
                  } catch {
                    // Clipboard permission not granted
                  }
                }}
                className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                Panodan Yapıştır
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="product-url-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.trendyol.com/…"
                  className="w-full pl-10 pr-4 py-3 sm:py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <button
                type="submit"
                disabled={step === 'step1' || step === 'step2' || step === 'step3'}
                className="px-4 py-3 sm:py-2.5 min-h-[44px] text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-xl sm:rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap shrink-0"
              >
                Ürünü Analiz Et
              </button>
            </div>

            {/* Quick sample URLs for convenient testing */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Örnek bağlantılar:</span>
              <button
                type="button"
                onClick={() =>
                  setUrlInput(
                    'https://www.trendyol.com/sony/wh-1000xm5-kablosuz-gurultu-engelleme-ozellikli-kulaklik-siyah-p-31245678'
                  )
                }
                className="underline hover:text-slate-800 dark:hover:text-slate-200"
              >
                Sony WH-1000XM5 (Trendyol)
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() =>
                  setUrlInput(
                    'https://www.hepsiburada.com/apple-iphone-16-128-gb-siyah-pm-HBC00006XYZ'
                  )
                }
                className="underline hover:text-slate-800 dark:hover:text-slate-200"
              >
                Apple iPhone 16 128 GB Siyah (Hepsiburada)
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() =>
                  setUrlInput(
                    'https://www.amazon.com.tr/Sony-WH-1000XM5-Kablosuz-Kulakl%C4%B1k-Siyah/dp/B09XS7JWHH'
                  )
                }
                className="underline hover:text-slate-800 dark:hover:text-slate-200"
              >
                Sony WH-1000XM5 (Amazon TR)
              </button>
            </div>
          </form>

          {/* Progress Steps (Section 7) */}
          {(step === 'step1' || step === 'step2' || step === 'step3') && (
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs">
                {step === 'step1' ? (
                  <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                )}
                <span
                  className={
                    step === 'step1'
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'text-slate-500'
                  }
                >
                  Ürün bilgileri analiz ediliyor…
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-xs">
                {step === 'step2' ? (
                  <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                ) : step === 'step3' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
                )}
                <span
                  className={
                    step === 'step2'
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'text-slate-500'
                  }
                >
                  Diğer mağazalarda aranıyor…
                </span>
              </div>

              <div className="flex items-center gap-2.5 text-xs">
                {step === 'step3' ? (
                  <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700 shrink-0" />
                )}
                <span
                  className={
                    step === 'step3'
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'text-slate-500'
                  }
                >
                  Fiyatlar karşılaştırılıyor…
                </span>
              </div>
            </div>
          )}

          {/* Error State (Section 30) */}
          {step === 'error' && (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                    {errorMessage}
                  </p>
                  <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                    Bağlantıyı kontrol edip tekrar deneyebilirsiniz.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleAnalyze()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-50 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tekrar Dene</span>
              </button>
            </div>
          )}

          {/* Detected Product Details (Section 7) */}
          {step === 'done' && candidate && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {candidate.image ? (
                      <img
                        src={candidate.image}
                        alt={candidate.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <Package className="w-8 h-8 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {candidate.storeName}
                      </span>
                      <span>·</span>
                      <span>Marka: {customBrand || candidate.brand}</span>
                      {candidate.productCode && (
                        <>
                          <span>·</span>
                          <span className="font-mono">Kod: {candidate.productCode}</span>
                        </>
                      )}
                    </div>

                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="w-full text-sm font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                      aria-label="Ürün adı"
                    />

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Model: {customModel || candidate.model}</span>
                      {candidate.specs.storage && (
                        <>
                          <span>·</span>
                          <span>Kapasite: {candidate.specs.storage}</span>
                        </>
                      )}
                      {candidate.specs.color && (
                        <>
                          <span>·</span>
                          <span>Renk: {candidate.specs.color}</span>
                        </>
                      )}
                    </div>

                    <a
                      href={candidate.normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline truncate max-w-md"
                    >
                      <span className="truncate">{candidate.normalizedUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Transparency Notice if Store Blocked Automated Scraping (Section 5 & 52) */}
                {candidate.extractionStatus !== 'verified' ? (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 space-y-2">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {candidate.extractionMessage ||
                        'Bu mağazanın fiyatı şu anda kontrol edilemedi.'}{' '}
                      (Mağaza otomatik bot koruması uyguluyor. Sahte fiyat üretilmedi.)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            Güncel Gözlemlenen Fiyat (İsteğe Bağlı, TL)
                          </label>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const clip = await navigator.clipboard.readText();
                                const parsed = parsePriceTR(clip, 'TRY');
                                if (parsed.isValid && parsed.amount) {
                                  setManualObservedPriceInput(String(parsed.amount));
                                  if (!targetPriceInput) {
                                    setTargetPriceInput(String(Math.round(parsed.amount * 0.9)));
                                  }
                                }
                              } catch {
                                // Ignore clipboard permission error
                              }
                            }}
                            className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                          >
                            Panodan Fiyat Yapıştır
                          </button>
                        </div>
                        <input
                          type="text"
                          value={manualObservedPriceInput}
                          onChange={(e) => setManualObservedPriceInput(e.target.value)}
                          placeholder="Örn: 9.249,00 TL"
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Hedef Fiyat (İsteğe Bağlı, TL)
                        </label>
                        <input
                          type="text"
                          value={targetPriceInput}
                          onChange={(e) => setTargetPriceInput(e.target.value)}
                          placeholder="Örn: 9.000 TL"
                          className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    <div>
                      <span className="block text-[11px] text-slate-500">
                        Doğrulanmış Güncel Fiyat
                      </span>
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatPriceTR(candidate.price, candidate.currency)}
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Hedef Fiyat Belirle (TL)
                      </label>
                      <input
                        type="text"
                        value={targetPriceInput}
                        onChange={(e) => setTargetPriceInput(e.target.value)}
                        placeholder="Örn: 9.000 TL"
                        className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Store Search Results Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Diğer Mağaza Taraması ({candidate.otherStoreOffers.length} Mağaza Kontrol Edildi)
                </h3>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                        <th className="py-2 px-3 font-medium">Mağaza</th>
                        <th className="py-2 px-3 font-medium">Eşleşme Güveni</th>
                        <th className="py-2 px-3 font-medium text-right">Fiyat / Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {candidate.otherStoreOffers.map((o) => (
                        <tr key={o.storeId}>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                            {o.storeName}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {o.status === 'verified' ? o.matchConfidence : '—'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            {o.status === 'verified' && o.price ? (
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {formatPriceTR(o.price, o.currency, false)}
                              </span>
                            ) : (
                              <span className="font-sans text-[11px] text-slate-400">
                                {o.statusMessage}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confirmation Prompt (Section 7) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Bu ürünü takip etmek ister misiniz?
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmAdd}
                    className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isSaving ? 'Kaydediliyor…' : 'Takibe Ekle'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
