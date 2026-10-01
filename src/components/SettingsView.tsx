import React, { useEffect, useRef, useState } from 'react';
import {
  Beaker,
  Bell,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sliders,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatPriceTR } from '../shared/priceUtils';
import { isElectron } from '../shared/platform';
import {
  CheckFrequency,
  NotificationRecord,
  PriceDropRuleType,
  ProductRecord,
  SystemLogRecord,
  UserSettings,
} from '../shared/types';

interface SettingsViewProps {
  settings: UserSettings;
  products: ProductRecord[];
  onUpdateSettings: (
    updates: Partial<UserSettings> & {
      telegramBotToken?: string;
      emailSmtpPassword?: string;
    }
  ) => Promise<void>;
  onRefreshAll: () => Promise<void>;
  onShowToast: (notif: NotificationRecord) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  products,
  onUpdateSettings,
  onRefreshAll,
  onShowToast,
}) => {
  const [activeSection, setActiveSection] = useState<
    'general' | 'checking' | 'notifications' | 'data' | 'logs' | 'dev'
  >('general');

  // Local editable form state
  const [theme, setTheme] = useState<'light' | 'dark'>(settings.theme);
  const [runInBackground, setRunInBackground] = useState(settings.runInBackground);
  const [launchAtStartup, setLaunchAtStartup] = useState(settings.launchAtStartup);
  const [devModeEnabled, setDevModeEnabled] = useState(settings.devModeEnabled);

  const [checkFrequency, setCheckFrequency] = useState<CheckFrequency>(
    settings.checkFrequency
  );
  const [preferredCheckTime, setPreferredCheckTime] = useState(
    settings.preferredCheckTime
  );
  const [dropRuleType, setDropRuleType] = useState<PriceDropRuleType>(
    settings.dropRuleType
  );
  const [minDropPercent, setMinDropPercent] = useState(settings.minDropPercent);
  const [minDropAmount, setMinDropAmount] = useState(settings.minDropAmount);
  const [notifyOnTargetReached, setNotifyOnTargetReached] = useState(
    settings.notifyOnTargetReached
  );
  const [notifyOnRestock, setNotifyOnRestock] = useState(settings.notifyOnRestock);
  const [notifyOnPriceIncrease, setNotifyOnPriceIncrease] = useState(
    settings.notifyOnPriceIncrease
  );

  const [macosNotificationsEnabled, setMacosNotificationsEnabled] = useState(
    settings.macosNotificationsEnabled
  );
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(
    settings.emailNotificationsEnabled
  );
  const [emailRecipient, setEmailRecipient] = useState(settings.emailRecipient);
  const [emailSmtpHost, setEmailSmtpHost] = useState(settings.emailSmtpHost);
  const [emailSmtpPort, setEmailSmtpPort] = useState(settings.emailSmtpPort);
  const [emailSmtpUser, setEmailSmtpUser] = useState(settings.emailSmtpUser);
  const [emailSmtpPassword, setEmailSmtpPassword] = useState('');

  const [telegramNotificationsEnabled, setTelegramNotificationsEnabled] = useState(
    settings.telegramNotificationsEnabled
  );
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState(settings.telegramChatId);

  const [statusMsg, setStatusMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingNotif, setIsTestingNotif] = useState(false);

  // Backup / Restore state
  const [overwriteOnImport, setOverwriteOnImport] = useState(false);
  const [confirmClearData, setConfirmClearData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Logs state
  const [logs, setLogs] = useState<SystemLogRecord[]>([]);
  const [logCategoryFilter, setLogCategoryFilter] = useState('ALL');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    setTheme(settings.theme);
    setRunInBackground(settings.runInBackground);
    setLaunchAtStartup(settings.launchAtStartup);
    setDevModeEnabled(settings.devModeEnabled);
    setCheckFrequency(settings.checkFrequency);
    setPreferredCheckTime(settings.preferredCheckTime);
    setDropRuleType(settings.dropRuleType);
    setMinDropPercent(settings.minDropPercent);
    setMinDropAmount(settings.minDropAmount);
    setNotifyOnTargetReached(settings.notifyOnTargetReached);
    setNotifyOnRestock(settings.notifyOnRestock);
    setNotifyOnPriceIncrease(settings.notifyOnPriceIncrease);
    setMacosNotificationsEnabled(settings.macosNotificationsEnabled);
    setEmailNotificationsEnabled(settings.emailNotificationsEnabled);
    setEmailRecipient(settings.emailRecipient);
    setEmailSmtpHost(settings.emailSmtpHost);
    setEmailSmtpPort(settings.emailSmtpPort);
    setEmailSmtpUser(settings.emailSmtpUser);
    setTelegramNotificationsEnabled(settings.telegramNotificationsEnabled);
    setTelegramChatId(settings.telegramChatId);
  }, [settings]);

  const fetchLogs = async (cat: string = logCategoryFilter) => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/logs?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
    } catch {
      // Ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'logs') {
      fetchLogs(logCategoryFilter);
    }
  }, [activeSection, logCategoryFilter]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setStatusMsg('');
    try {
      const payload: Partial<UserSettings> & {
        telegramBotToken?: string;
        emailSmtpPassword?: string;
      } = {
        theme,
        runInBackground,
        launchAtStartup,
        devModeEnabled,
        checkFrequency,
        preferredCheckTime,
        dropRuleType,
        minDropPercent: Number(minDropPercent) || 5,
        minDropAmount: Number(minDropAmount) || 500,
        notifyOnTargetReached,
        notifyOnRestock,
        notifyOnPriceIncrease,
        macosNotificationsEnabled,
        emailNotificationsEnabled,
        emailRecipient,
        emailSmtpHost,
        emailSmtpPort: Number(emailSmtpPort) || 587,
        emailSmtpUser,
        telegramNotificationsEnabled,
        telegramChatId,
      };

      if (telegramBotToken.trim()) {
        payload.telegramBotToken = telegramBotToken.trim();
      }
      if (emailSmtpPassword.trim()) {
        payload.emailSmtpPassword = emailSmtpPassword.trim();
      }

      await onUpdateSettings(payload);
      if (isElectron() && window.electronAPI) {
        window.electronAPI.setRunInBackground?.(runInBackground);
        window.electronAPI.setLaunchAtStartup?.(launchAtStartup);
      }
      setTelegramBotToken('');
      setEmailSmtpPassword('');
      setStatusMsg('Ayarlar başarıyla kaydedildi.');
    } catch {
      setStatusMsg('Ayarlar kaydedilirken hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsTestingNotif(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      if (data.dispatched?.notification) {
        onShowToast(data.dispatched.notification);
        if (isElectron() && window.electronAPI?.showNotification) {
          window.electronAPI.showNotification({
            title: data.dispatched.notification.title,
            body: data.dispatched.notification.message,
            url: data.dispatched.notification.product_url,
          });
        } else if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(data.dispatched.notification.title, {
            body: data.dispatched.notification.message,
          });
        } else if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
      await onRefreshAll();
      setStatusMsg('Test bildirimi başarıyla oluşturuldu ve gönderildi.');
    } catch {
      setStatusMsg('Test bildirimi gönderilemedi.');
    } finally {
      setIsTestingNotif(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const res = await fetch('/api/data/export-json');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiyat-takip-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('JSON yedeği başarıyla indirildi.');
    } catch {
      setStatusMsg('Yedek dosyası oluşturulamadı.');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Ürün Adı',
      'Marka',
      'Model',
      'Mağaza',
      'Güncel Fiyat',
      'Önceki Fiyat',
      'Hedef Fiyat',
      'Durum',
      'Son Kontrol',
      'Ürün Bağlantısı',
    ];
    const rows = products.map((p) => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.brand || '').replace(/"/g, '""')}"`,
      `"${(p.model || '').replace(/"/g, '""')}"`,
      `"${p.current_lowest_store || ''}"`,
      p.current_lowest_price ? formatPriceTR(p.current_lowest_price, p.currency, false) : '',
      p.previous_lowest_price ? formatPriceTR(p.previous_lowest_price, p.currency, false) : '',
      p.target_price ? formatPriceTR(p.target_price, p.currency, false) : '',
      p.active ? 'Takip Ediliyor' : 'Durduruldu',
      p.last_checked_at || '',
      `"${p.original_url}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fiyat-takip-urunler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('CSV tablosu başarıyla dışa aktarıldı.');
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/data/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup: parsed,
          overwrite: overwriteOnImport,
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        await onRefreshAll();
        setStatusMsg(
          `Yedek geri yüklendi: ${data.result.importedProducts} ürün eklendi (${data.result.skippedProducts} mevcut ürün korundu).`
        );
      } else {
        setStatusMsg(data.error || 'Yedek geri yüklenemedi.');
      }
    } catch {
      setStatusMsg('Geçersiz JSON yedek dosyası.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearAllData = async () => {
    try {
      await fetch('/api/data/clear', { method: 'POST' });
      setConfirmClearData(false);
      await onRefreshAll();
      setStatusMsg('Tüm ürün ve fiyat geçmişi verileri temizlendi.');
    } catch {
      setStatusMsg('Veriler temizlenirken hata oluştu.');
    }
  };

  const handleRunDevSimulation = async (
    simulationType:
      | 'price_drop'
      | 'price_increase'
      | 'target_reached'
      | 'out_of_stock'
      | 'restock'
      | 'store_failure'
      | 'suspicious_price'
  ) => {
    setStatusMsg('Simülasyon çalıştırılıyor…');
    try {
      const res = await fetch('/api/dev/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulationType }),
      });
      const data = await res.json();
      if (data.notification) {
        onShowToast(data.notification);
      }
      await onRefreshAll();
      setStatusMsg(data.message || 'Simülasyon tamamlandı.');
    } catch {
      setStatusMsg('Simülasyon çalıştırılamadı.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Ayarlar</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Uygulama davranışını, zamanlayıcıyı, bildirim kanallarını ve yerel veritabanını yönetin.
          </p>
        </div>

        <button
          onClick={() => handleSave()}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{isSaving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}</span>
        </button>
      </div>

      {statusMsg && (
        <div className="px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            onClick={() => setStatusMsg('')}
            className="text-emerald-600 dark:text-emerald-400 hover:underline text-[11px]"
          >
            Tamam
          </button>
        </div>
      )}

      {/* Section Navigation Tabs (Section 29 & 31) */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('general')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSection === 'general'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Genel</span>
        </button>

        <button
          onClick={() => setActiveSection('checking')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSection === 'checking'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Fiyat Kontrolü</span>
        </button>

        <button
          onClick={() => setActiveSection('notifications')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSection === 'notifications'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Bildirimler</span>
        </button>

        <button
          onClick={() => setActiveSection('data')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSection === 'data'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Veri</span>
        </button>

        <button
          onClick={() => setActiveSection('logs')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSection === 'logs'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Teknik Günlük</span>
        </button>

        {devModeEnabled && (
          <button
            onClick={() => setActiveSection('dev')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeSection === 'dev'
                ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <Beaker className="w-3.5 h-3.5" />
            <span>Geliştirici Test Modu</span>
          </button>
        )}
      </div>

      {/* 1. GENEL AYARLAR */}
      {activeSection === 'general' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Genel Uygulama Ayarları
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tema
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    onUpdateSettings({ theme: 'light' });
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    theme === 'light'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Açık Tema (Light)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    onUpdateSettings({ theme: 'dark' });
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                    theme === 'dark'
                      ? 'bg-sky-500 text-slate-950 border-sky-500 font-semibold'
                      : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  Koyu Tema (Dark)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Uygulama Dili
              </label>
              <select
                disabled
                value="tr"
                className="w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
              >
                <option value="tr">Türkçe (Varsayılan)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {isElectron()
                    ? 'Arka Planda Çalış (Menü Çubuğu Modu)'
                    : 'Sunucu Tabanlı 7/24 Otomatik Takip (Arka Plan Zamanlayıcısı)'}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {isElectron()
                    ? 'Pencere kapatıldığında uygulamayı tamamen kapatmak yerine menü çubuğunda çalıştırmaya devam eder.'
                    : 'Tarayıcı sekmeniz kapalı olsa bile web sunucusu üzerinde zamanlanmış fiyat kontrollerine kesintisiz devam eder.'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={runInBackground}
                onChange={(e) => setRunInBackground(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
            </label>

            {isElectron() && (
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Bilgisayar Açıldığında Otomatik Başlat
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    macOS veya Windows oturumu açıldığında Fiyat Takip Agent masaüstü uygulamasını otomatik başlatır.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => setLaunchAtStartup(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
              </label>
            )}

            <label className="flex items-center justify-between gap-4 cursor-pointer pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Geliştirici / Test Modu
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  Fiyat düşüşü, hedef fiyat, stok değişimi ve mağaza hatası senaryolarını test etmek için geliştirici araçlarını etkinleştirir.
                </span>
              </div>
              <input
                type="checkbox"
                checked={devModeEnabled}
                onChange={(e) => {
                  setDevModeEnabled(e.target.checked);
                  onUpdateSettings({ devModeEnabled: e.target.checked });
                }}
                className="w-4 h-4 rounded border-slate-300"
              />
            </label>
          </div>
        </div>
      )}

      {/* 2. FİYAT KONTROLÜ VE KURALLAR (Section 14 & 15) */}
      {activeSection === 'checking' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Zamanlayıcı ve Fiyat Düşüş Kuralları
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Kontrol sıklığı
              </label>
              <select
                value={checkFrequency}
                onChange={(e) => setCheckFrequency(e.target.value as CheckFrequency)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              >
                <option value="daily_1">Günde 1 kez (Varsayılan)</option>
                <option value="daily_2">Günde 2 kez</option>
                <option value="daily_4">Günde 4 kez</option>
                <option value="every_6h">Her 6 saatte bir</option>
                <option value="every_3h">Her 3 saatte bir</option>
                <option value="manual">Manuel kontrol</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Tercih edilen kontrol saati (Her gün)
              </label>
              <input
                type="time"
                value={preferredCheckTime}
                onChange={(e) => setPreferredCheckTime(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <span className="block text-[11px] text-slate-400 mt-1">
                İşletim sisteminin yerel saatine göre çalışır (Örn: Her gün {preferredCheckTime}).
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Fiyat Düşüşü Bildirim Eşiği (Bölüm 14)
            </h3>

            <div className="space-y-2.5 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="dropRuleType"
                  checked={dropRuleType === 'any'}
                  onChange={() => setDropRuleType('any')}
                />
                <span>Herhangi bir fiyat düşüşünde bildir</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="dropRuleType"
                  checked={dropRuleType === 'percent'}
                  onChange={() => setDropRuleType('percent')}
                />
                <span>Sadece belirli bir yüzde (%X) üzerindeki düşüşlerde bildir</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="dropRuleType"
                  checked={dropRuleType === 'amount'}
                  onChange={() => setDropRuleType('amount')}
                />
                <span>Belirli bir TL tutarından fazla düşüşlerde bildir</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Minimum düşüş yüzdesi (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={minDropPercent}
                  onChange={(e) => setMinDropPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Minimum düşüş tutarı (TL)
                </label>
                <input
                  type="number"
                  min={1}
                  step={50}
                  value={minDropAmount}
                  onChange={(e) => setMinDropAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <label className="flex items-center justify-between cursor-pointer">
                <span>Hedef fiyata ulaşıldığında bildir (🎯 Hedef fiyatınıza ulaşıldı!)</span>
                <input
                  type="checkbox"
                  checked={notifyOnTargetReached}
                  onChange={(e) => setNotifyOnTargetReached(e.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span>Tükenen ürün tekrar stoklara girdiğinde bildir (Tükendi → Stokta)</span>
                <input
                  type="checkbox"
                  checked={notifyOnRestock}
                  onChange={(e) => setNotifyOnRestock(e.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span>Fiyat artışlarında da bildirim gönder (İsteğe bağlı)</span>
                <input
                  type="checkbox"
                  checked={notifyOnPriceIncrease}
                  onChange={(e) => setNotifyOnPriceIncrease(e.target.checked)}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 3. BİLDİRİM KANALLARI (Section 13) */}
      {activeSection === 'notifications' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Bildirim Yöntemleri (Web Tarayıcı, E-posta, Telegram)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Parola ve bot anahtarları sunucu veritabanında AES-256-GCM ile şifrelenerek saklanır.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSendTestNotification}
              disabled={isTestingNotif}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isTestingNotif ? 'Gönderiliyor…' : 'Test Bildirimi Gönder'}
              </span>
            </button>
          </div>

          {/* Web Browser Notification */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Web Tarayıcı Bildirimleri (Web Push & Uygulama İçi Uyarılar)
              </p>
              <p className="text-[11px] text-slate-500">
                Masaüstü ve mobil web tarayıcınız üzerinden anlık fiyat düşüşü bildirimleri gönderir.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const perm = await Notification.requestPermission();
                      if (perm === 'granted') {
                        setStatusMsg('Tarayıcı bildirim izni başarıyla etkinleştirildi.');
                      }
                    } catch {
                      // Ignore
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-sky-600 text-white rounded-md hover:bg-sky-500"
                >
                  Tarayıcı İzni Ver
                </button>
              )}
              <input
                type="checkbox"
                checked={macosNotificationsEnabled}
                onChange={(e) => setMacosNotificationsEnabled(e.target.checked)}
                className="w-4 h-4"
              />
            </div>
          </div>

          {/* Telegram Notification */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Telegram Bildirimleri
                </p>
                <p className="text-[11px] text-slate-500">
                  Telegram Bot API aracılığıyla telefonunuza veya grubunuza mesaj gönderir.
                </p>
              </div>
              <input
                type="checkbox"
                checked={telegramNotificationsEnabled}
                onChange={(e) => setTelegramNotificationsEnabled(e.target.checked)}
                className="w-4 h-4"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Telegram Bot Token{' '}
                  {settings.telegramBotTokenSet && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      (Kayıtlı: {settings.telegramBotTokenMasked})
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder={
                    settings.telegramBotTokenSet
                      ? 'Değiştirmek için yeni token girin'
                      : '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ'
                  }
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chat ID
                </label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="Örn: 987654321"
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Email Notification */}
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  E-posta Bildirimleri
                </p>
                <p className="text-[11px] text-slate-500">
                  Fiyat düşüşlerini belirttiğiniz e-posta adresine iletir.
                </p>
              </div>
              <input
                type="checkbox"
                checked={emailNotificationsEnabled}
                onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
                className="w-4 h-4"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alıcı E-posta Adresi
                </label>
                <input
                  type="email"
                  value={emailRecipient}
                  onChange={(e) => setEmailRecipient(e.target.value)}
                  placeholder="ornek@eposta.com"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  SMTP Sunucusu ve Port
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={emailSmtpHost}
                    onChange={(e) => setEmailSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <input
                    type="number"
                    value={emailSmtpPort}
                    onChange={(e) => setEmailSmtpPort(Number(e.target.value))}
                    className="w-20 px-2 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  SMTP Kullanıcı Adı
                </label>
                <input
                  type="text"
                  value={emailSmtpUser}
                  onChange={(e) => setEmailSmtpUser(e.target.value)}
                  placeholder="ornek@gmail.com"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  SMTP Parolası (Şifreli Depolanır){' '}
                  {settings.emailSmtpPasswordSet && (
                    <span className="text-emerald-600 dark:text-emerald-400">(Kayıtlı)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={emailSmtpPassword}
                  onChange={(e) => setEmailSmtpPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. VERİ YÖNETİMİ VE YEDEKLEME (Section 20, 25, 29) */}
      {activeSection === 'data' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Veritabanı ve Yedekleme İşlemleri
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tüm ürün takip verileriniz web sunucusundaki SQLite veritabanında (`data/fiyat_takip.sqlite`) güvenle saklanır ve JSON/CSV olarak dışa aktarılabilir.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                JSON Yedekleme
              </h3>
              <p className="text-[11px] text-slate-500">
                Tüm takip edilen ürünleri, mağaza tekliflerini ve fiyat geçmişini JSON formatında yedekleyin.
              </p>
              <button
                type="button"
                onClick={handleExportJson}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg hover:opacity-90"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Yedekle (JSON)</span>
              </button>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                CSV Tablo Dışa Aktarımı
              </h3>
              <p className="text-[11px] text-slate-500">
                Takip listenizi Excel veya Numbers ile açabileceğiniz Türkçe karakter uyumlu CSV dosyası olarak indirin.
              </p>
              <button
                type="button"
                onClick={handleExportCsv}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV Olarak Dışa Aktar</span>
              </button>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Yedeği Geri Yükle
              </h3>
              <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overwriteOnImport}
                  onChange={(e) => setOverwriteOnImport(e.target.checked)}
                />
                <span>Mevcut ürünlerin üzerine yazılmasına izin ver</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-sky-600 text-white rounded-lg hover:bg-sky-500"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Yedeği Geri Yükle</span>
              </button>
            </div>
          </div>

          {/* Clear All Data */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Gizlilik İlkesi: Hesap kaydı gerekmez, kişisel veri toplanmaz.</span>
            </div>

            {!confirmClearData ? (
              <button
                type="button"
                onClick={() => setConfirmClearData(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-lg hover:bg-rose-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Verileri temizle</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-rose-600">
                  Tüm ürünler silinsin mi?
                </span>
                <button
                  type="button"
                  onClick={handleClearAllData}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg"
                >
                  Evet, Temizle
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearData(false)}
                  className="px-3 py-1.5 text-xs bg-slate-200 dark:bg-slate-800 rounded-lg"
                >
                  İptal
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. TEKNİK GÜNLÜK (Section 31) */}
      {activeSection === 'logs' && (
        <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Teknik Günlük (Sistem ve Fiyat Kontrol Kayıtları)
              </h2>
              <p className="text-xs text-slate-500">
                Fiyat kontrolleri, mağaza hataları, eşleşme sonuçları ve bildirim denemeleri.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={logCategoryFilter}
                onChange={(e) => setLogCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="ALL">Tüm Kategoriler</option>
                <option value="PRICE_CHECK">Fiyat Kontrolleri</option>
                <option value="STORE_ERROR">Mağaza Hataları</option>
                <option value="PRODUCT_MATCH">Ürün Eşleştirme</option>
                <option value="NOTIFICATION">Bildirimler</option>
                <option value="SYSTEM">Sistem</option>
              </select>

              <button
                type="button"
                onClick={() => fetchLogs(logCategoryFilter)}
                className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-800 rounded-lg hover:opacity-80"
              >
                Yenile
              </button>

              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/logs', { method: 'DELETE' });
                  fetchLogs(logCategoryFilter);
                }}
                className="px-3 py-1.5 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-lg"
              >
                Günlüğü Temizle
              </button>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto font-mono text-xs">
            {isLoadingLogs ? (
              <div className="p-6 text-center text-slate-400">Günlük yükleniyor…</div>
            ) : logs.length === 0 ? (
              <div className="p-6 text-center text-slate-400">
                Kayıtlı teknik günlük girdisi bulunmuyor.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3">Zaman</th>
                    <th className="py-2 px-3">Seviye</th>
                    <th className="py-2 px-3">Kategori</th>
                    <th className="py-2 px-3">Mesaj</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleTimeString('tr-TR')}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={
                            log.level === 'ERROR'
                              ? 'text-rose-600 font-semibold'
                              : log.level === 'WARN'
                              ? 'text-amber-500 font-semibold'
                              : 'text-emerald-600'
                          }
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">{log.category}</td>
                      <td className="py-2 px-3 text-slate-800 dark:text-slate-200 font-sans">
                        {log.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 6. GELİŞTİRİCİ / TEST MODU (Section 38 & 47) */}
      {activeSection === 'dev' && devModeEnabled && (
        <div className="p-6 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-300 dark:border-amber-800/70 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Geliştirici ve Simülasyon Konsolu
            </h2>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Bu bölüm yalnızca Geliştirici Modu etkinleştirildiğinde görünür. Bildirim, hedef fiyat, şüpheli fiyat ve mağaza hatası senaryolarını test etmenizi sağlar.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleRunDevSimulation('price_drop')}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-emerald-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Test Price Drop (Fiyat Düşüşü Simüle Et)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Seçili ürünün fiyatını %12 düşürür ve Fiyat Düştü bildirimi üretir.
              </span>
            </button>

            <button
              type="button"
              onClick={handleSendTestNotification}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-sky-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Test Notification (Bildirim Gönder)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Web Tarayıcı, Telegram ve E-posta kanallarını örnek bildirimle test eder.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRunDevSimulation('target_reached')}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-emerald-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Test Target Price (Hedef Fiyat Ulaşıldı)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Fiyatı hedef fiyatın altına indirir ve 🎯 Hedef fiyatınıza ulaşıldı bildirimi gönderir.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRunDevSimulation('store_failure')}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-rose-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Test Store Failure (Mağaza Hatası)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Mağaza erişim engelini simüle eder, son fiyatı korur ve sahte fiyat üretmez.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRunDevSimulation('price_increase')}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-amber-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Fiyat Artışı Simüle Et (+%6)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                Fiyat artışını geçmişe kaydeder, yanlış düşüş bildirimi göndermez.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleRunDevSimulation('suspicious_price')}
              className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-amber-500 transition-colors"
            >
              <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                Şüpheli Fiyat Algılama (10 TL Hatası)
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                10.000 TL → 10 TL ayrıştırma hatasını ‘Şüpheli fiyat’ olarak işaretler ve onay ister.
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
