import React, { useState } from 'react';
import {
  Bell,
  Check,
  Copy,
  Download,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onNavigateSettings?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  onNavigateSettings,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string>('');

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleRequestIOSNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotifStatus(
        'iPhone bildirimleri için önce uygulamayı Safari üzerinden "Ana Ekrana Ekle" ile kurun (iOS 16.4+).'
      );
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifStatus('iPhone anlık bildirim izni etkinleştirildi!');
        new Notification('Fiyat Takip Agent', {
          body: 'iPhone fiyat düşüş bildirimleri başarıyla aktif edildi.',
        });
      } else {
        setNotifStatus('Bildirim izni verilmedi. Ayarlar > Bildirimler bölümünden Telegram bildirimlerini de kullanabilirsiniz.');
      }
    } catch {
      setNotifStatus(
        'Bildirim izni yalnızca uygulama Ana Ekrana eklendikten sonra etkinleştirilebilir.'
      );
    }
  };

  return (
    <>
      {!isInstalled && (
        <button
          type="button"
          onClick={async () => {
            if (isInstallable && !isIOS) {
              const accepted = await install();
              if (!accepted) setShowIOSModal(true);
            } else {
              setShowIOSModal(true);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-colors whitespace-nowrap"
          title="Web Uygulamasını Cihaza Yükle (PWA)"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Cihaza Yükle</span>
        </button>
      )}

      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Grab Handle for mobile sheet */}
            <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Web Uygulaması & Mobil (PWA) Kurulumu
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tarayıcıdan veya iPhone / Android Ana Ekranından tam ekran erişim
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                aria-label="Kapat"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto text-xs">
              {/* Step 0: Copy Link to open in iPhone Safari */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Uygulama Bağlantısı (iPhone Safari’de Açın)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg whitespace-nowrap"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kopyalandı</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 3 Steps for iOS Safari Add to Home Screen */}
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  iPhone Ana Ekranına Ekleme Adımları:
                </h4>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Share className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      1. Safari’de “Paylaş” Düğmesine Dokunun
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      iPhone’unuzda bu adresi <strong>Safari</strong> tarayıcısında açın ve ekranın alt ortasındaki <strong>Paylaş</strong> (yukarı ok) simgesine dokunun.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      2. “Ana Ekrana Ekle” Seçeneğini Seçin
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Açılan menüyü aşağı kaydırıp <strong>“Ana Ekrana Ekle” (Add to Home Screen)</strong> satırına dokunun.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      3. iPhone Bildirimlerini ve Telegram’ı Etkinleştirin
                    </p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Ana ekrandaki <strong>FiyatTakip</strong> simgesinden uygulamayı açtığınızda iOS bildirim izni verebilir veya 7/24 anlık bildirim için <strong>Telegram Bot</strong> kanalını kullanabilirsiniz.
                    </p>
                  </div>
                </div>
              </div>

              {notifStatus && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
                  {notifStatus}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestIOSNotificationPermission}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-colors"
                  >
                    <Bell className="w-4 h-4" />
                    <span>iOS Bildirim İzni İste</span>
                  </button>

                  {isInstallable && (
                    <button
                      type="button"
                      onClick={install}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-500 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Doğrudan Yükle</span>
                    </button>
                  )}

                  {onNavigateSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowIOSModal(false);
                        onNavigateSettings();
                      }}
                      className="px-3.5 py-2.5 min-h-[44px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl"
                    >
                      Telegram Ayarları
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="px-4 py-2.5 min-h-[44px] font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl"
                >
                  Tamam
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
