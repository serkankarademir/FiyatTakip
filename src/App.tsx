import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Eye,
  Info,
  LayoutDashboard,
  ListChecks,
  Moon,
  Package,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Store,
  Sun,
  TrendingDown,
  WifiOff,
  Minimize2,
} from 'lucide-react';
import { AddProductModal } from './components/AddProductModal';
import { MenuBarPopover } from './components/MenuBarPopover';
import { NotificationToast } from './components/NotificationToast';
import { ProductDetailView } from './components/ProductDetailView';
import { PWAInstallButton } from './components/PWAInstallModal';
import { SettingsView } from './components/SettingsView';
import {
  calculatePriceChange,
  formatPriceTR,
  isTargetPriceReached,
} from './shared/priceUtils';
import {
  CurrencyCode,
  DEFAULT_USER_SETTINGS,
  NotificationRecord,
  ProductRecord,
  StoreRecord,
  UserSettings,
} from './shared/types';

type NavTab =
  | 'dashboard'
  | 'watchlist'
  | 'drops'
  | 'stores'
  | 'notifications'
  | 'settings'
  | 'about';

interface PriceDropEvent {
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
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDropEvent[]>([]);
  const [settings, setSettings] = useState<UserSettings>(() => {
    const savedTheme = localStorage.getItem('fta_theme') as 'light' | 'dark' | null;
    return {
      ...DEFAULT_USER_SETTINGS,
      theme: savedTheme || DEFAULT_USER_SETTINGS.theme,
    };
  });

  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingProductId, setCheckingProductId] = useState<string | null>(null);
  const [checkingStoreId, setCheckingStoreId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeToast, setActiveToast] = useState<NotificationRecord | null>(null);
  const [isMenuBarOpen, setIsMenuBarOpen] = useState(false);
  const [isMinimizedToTray, setIsMinimizedToTray] = useState(false);

  // Dashboard / Watchlist Search, Filter & Sort State (Section 26)
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'dropped' | 'target_reached' | 'out_of_stock' | 'active' | 'inactive'
  >('all');
  const [sortBy, setSortBy] = useState<
    'largest_drop' | 'lowest_price' | 'recently_checked' | 'recently_added'
  >('recently_added');

  // Sync Dark/Light mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('fta_theme', settings.theme);
  }, [settings.theme]);

  const fetchBootstrapData = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data.products || []);
      setStores(data.stores || []);
      setNotifications(data.notifications || []);
      setPriceDrops(data.priceDrops || []);
      if (data.settings) {
        setSettings(data.settings);
      }
      setIsOnline(data.online !== false);
    } catch {
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrapData();
    const interval = setInterval(fetchBootstrapData, 30_000);
    return () => clearInterval(interval);
  }, [fetchBootstrapData]);

  const handleUpdateSettings = async (
    updates: Partial<UserSettings> & {
      telegramBotToken?: string;
      emailSmtpPassword?: string;
    }
  ) => {
    if (updates.theme) {
      setSettings((prev) => ({ ...prev, theme: updates.theme! }));
    }
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.settings) {
      setSettings(data.settings);
    }
  };

  const handleCheckAllPrices = async () => {
    setIsCheckingAll(true);
    setBannerMessage('Fiyat kontrol ediliyor…');
    try {
      const res = await fetch('/api/check-all', { method: 'POST' });
      const data = await res.json();
      await fetchBootstrapData();
      if (data.summary?.offline) {
        setBannerMessage(
          'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.'
        );
      } else {
        const nowStr = new Date().toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        setBannerMessage(`Son kontrol: ${nowStr} — ${data.summary?.message || ''}`);
        if (
          data.summary?.notificationsTriggered &&
          data.summary.notificationsTriggered.length > 0
        ) {
          setActiveToast(data.summary.notificationsTriggered[0]);
        }
      }
    } catch {
      setBannerMessage(
        'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.'
      );
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleCheckSingleProduct = async (productId: string) => {
    setCheckingProductId(productId);
    setBannerMessage('Fiyat kontrol ediliyor…');
    try {
      const res = await fetch(`/api/products/${productId}/check`, {
        method: 'POST',
      });
      const data = await res.json();
      await fetchBootstrapData();
      const nowStr = new Date().toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      if (data.summary?.offline) {
        setBannerMessage(
          'İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.'
        );
      } else {
        setBannerMessage(`Son kontrol: ${nowStr}`);
        if (
          data.summary?.notificationsTriggered &&
          data.summary.notificationsTriggered.length > 0
        ) {
          setActiveToast(data.summary.notificationsTriggered[0]);
        }
      }
    } catch {
      setBannerMessage(
        'Ürün bilgileri alınamadı. Mağaza sayfası şu anda erişilebilir olmayabilir.'
      );
    } finally {
      setCheckingProductId(null);
    }
  };

  const handleToggleProductActive = async (product: ProductRecord) => {
    await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !product.active }),
    });
    await fetchBootstrapData();
  };

  const handleDeleteProduct = async (productId: string) => {
    await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (selectedProductId === productId) {
      setSelectedProductId(null);
    }
    await fetchBootstrapData();
  };

  const handleLoadDeveloperSamples = async () => {
    setIsLoading(true);
    try {
      await handleUpdateSettings({ devModeEnabled: true, firstRunCompleted: true });
      await fetch('/api/dev/seed-samples', { method: 'POST' });
      await fetchBootstrapData();
    } finally {
      setIsLoading(false);
    }
  };

  // Summary Card Metrics (Section 8)
  const summaryMetrics = useMemo(() => {
    const trackedCount = products.filter((p) => p.active).length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const droppedTodayProducts = products.filter((p) => {
      if (!p.price_change_amount || p.price_change_amount >= 0) return false;
      if (!p.last_checked_at) return true;
      return new Date(p.last_checked_at).getTime() >= todayStart.getTime();
    });

    let maxDropPercent = 0;
    let maxDropProductName = '—';
    let totalSavingsAmount = 0;

    for (const p of products) {
      if (p.price_change_amount && p.price_change_amount < 0) {
        const absAmount = Math.abs(p.price_change_amount);
        const absPercent = Math.abs(p.price_change_percent || 0);
        totalSavingsAmount += absAmount;
        if (absPercent > maxDropPercent) {
          maxDropPercent = absPercent;
          maxDropProductName = p.name;
        }
      }
    }

    return {
      trackedCount,
      droppedTodayCount: droppedTodayProducts.length,
      maxDropPercent,
      maxDropProductName,
      totalSavingsAmount,
    };
  }, [products]);

  // Filtered and Sorted Products (Section 26)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');

    const filtered = products.filter((p) => {
      if (q) {
        const haystack = `${p.name} ${p.brand} ${p.model} ${p.product_code}`.toLocaleLowerCase(
          'tr-TR'
        );
        if (!haystack.includes(q)) return false;
      }

      if (storeFilter !== 'ALL') {
        const hasStore = (p.offers || []).some((o) => o.store_id === storeFilter);
        if (!hasStore) return false;
      }

      switch (statusFilter) {
        case 'dropped':
          if (!p.price_change_amount || p.price_change_amount >= 0) return false;
          break;
        case 'target_reached':
          if (!isTargetPriceReached(p.current_lowest_price, p.target_price)) return false;
          break;
        case 'out_of_stock':
          if (p.availability_summary !== 'Tükendi') return false;
          break;
        case 'active':
          if (!p.active) return false;
          break;
        case 'inactive':
          if (p.active) return false;
          break;
      }

      return true;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'largest_drop': {
          const dropA = a.price_change_percent && a.price_change_percent < 0 ? Math.abs(a.price_change_percent) : -1;
          const dropB = b.price_change_percent && b.price_change_percent < 0 ? Math.abs(b.price_change_percent) : -1;
          return dropB - dropA;
        }
        case 'lowest_price':
          return (a.current_lowest_price ?? Infinity) - (b.current_lowest_price ?? Infinity);
        case 'recently_checked':
          return (
            new Date(b.last_checked_at || 0).getTime() -
            new Date(a.last_checked_at || 0).getTime()
          );
        case 'recently_added':
        default:
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
      }
    });

    return filtered;
  }, [products, searchQuery, storeFilter, statusFilter, sortBy]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // If minimized to macOS menu bar in background mode (Section 16)
  if (isMinimizedToTray) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <MenuBarPopover
          isOpen={true}
          onClose={() => {}}
          isMinimizedToTray={true}
          onRestoreWindow={() => setIsMinimizedToTray(false)}
          onCheckAllPrices={handleCheckAllPrices}
          onNavigate={(tab) => {
            setIsMinimizedToTray(false);
            setSelectedProductId(null);
            setActiveTab(tab as NavTab);
          }}
          onQuitApp={() => {
            setIsMinimizedToTray(false);
          }}
          activeProductsCount={summaryMetrics.trackedCount}
          isCheckingAll={isCheckingAll}
        />
        <div className="text-center max-w-md space-y-3 mt-48">
          <p className="text-sm font-semibold text-slate-300">
            Fiyat Takip Agent arka planda çalışıyor
          </p>
          <p className="text-xs text-slate-500">
            “Arka planda çalış” ayarı etkin olduğu için ana pencere kapatıldığında uygulama macOS menü çubuğuna küçültüldü. Zamanlanmış fiyat kontrolleri devam ediyor.
          </p>
          <button
            onClick={() => setIsMinimizedToTray(false)}
            className="px-4 py-2 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors"
          >
            Uygulamayı Aç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Native macOS Window Title Bar & Mobile iOS Top Bar */}
      <header className="min-h-12 px-3 sm:px-4 py-1.5 pt-safe bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 select-none">
        {/* Left: macOS Window Controls + Brand */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex items-center gap-1.5" title="macOS Pencere Kontrolleri">
            <button
              onClick={() => {
                if (settings.runInBackground) {
                  setIsMinimizedToTray(true);
                }
              }}
              aria-label="Pencereyi kapat veya menü çubuğuna küçült"
              className="w-3 h-3 rounded-full bg-rose-500 hover:bg-rose-600 transition-colors"
            />
            <button
              onClick={() => setIsMinimizedToTray(true)}
              aria-label="Menü çubuğuna küçült"
              className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 transition-colors"
            />
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
          </div>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('dashboard');
            }}
            className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 hover:opacity-80 transition-opacity"
          >
            Fiyat Takip Agent
          </button>
        </div>

        {/* Center Subtitle */}
        <div className="hidden lg:block text-xs text-slate-500 dark:text-slate-400">
          İnternetteki ürün fiyatlarını otomatik takip edin.
        </div>

        {/* Right Primary Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <PWAInstallButton
            onNavigateSettings={() => {
              setSelectedProductId(null);
              setActiveTab('settings');
            }}
          />

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Ürün Ekle</span>
          </button>

          <button
            onClick={handleCheckAllPrices}
            disabled={isCheckingAll || products.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 min-h-[36px] text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Şimdi Kontrol Et</span>
          </button>

          <button
            onClick={() =>
              handleUpdateSettings({
                theme: settings.theme === 'dark' ? 'light' : 'dark',
              })
            }
            aria-label="Temayı değiştir"
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={settings.theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => setIsMenuBarOpen(!isMenuBarOpen)}
            aria-label="macOS Menü Çubuğu"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
            title="macOS Menü Çubuğu Seçenekleri"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Menü Çubuğu</span>
          </button>
        </div>
      </header>

      {/* Offline Warning Banner (Section 17) */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 px-6 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            İnternet bağlantısı yok. Fiyat kontrolü daha sonra tekrar denenecek.
          </span>
        </div>
      )}

      {/* Main Desktop & Mobile Workspace (Sidebar + Content Area) */}
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar Navigation (Section 27 & 28) - Desktop */}
        <aside className="hidden md:flex w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col justify-between p-3 shrink-0">
          <div className="space-y-1">
            <div className="px-3 py-2 mb-2">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Fiyat Takip Agent
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                İnternetteki ürün fiyatlarını otomatik takip edin.
              </p>
            </div>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('dashboard');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'dashboard' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </span>
            </button>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('watchlist');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'watchlist' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ListChecks className="w-4 h-4" />
                <span>Takip Listem</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('drops');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'drops' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <TrendingDown className="w-4 h-4" />
                <span>Fiyat Düşüşleri</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">
                {priceDrops.length}
              </span>
            </button>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('stores');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'stores' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Store className="w-4 h-4" />
                <span>Mağazalar</span>
              </span>
              <span className="font-mono text-[11px] opacity-75">
                {stores.length}
              </span>
            </button>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('notifications');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'notifications' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" />
                <span>Bildirimler</span>
              </span>
              {unreadNotificationsCount > 0 && (
                <span className="font-mono text-[11px] font-bold text-emerald-500">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('settings');
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'settings' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4" />
                <span>Ayarlar</span>
              </span>
            </button>
          </div>

          {/* Bottom Sidebar: About ("Hakkında") & Schedule Info */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => {
                setSelectedProductId(null);
                setActiveTab('about');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'about' && !selectedProductId
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-sky-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Info className="w-4 h-4" />
              <span>Hakkında</span>
            </button>

            <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
              <div className="flex items-center justify-between">
                <span>Otomatik Kontrol:</span>
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {settings.checkFrequency === 'daily_1'
                    ? `Her gün ${settings.preferredCheckTime}`
                    : settings.checkFrequency === 'daily_2'
                    ? 'Günde 2 kez'
                    : settings.checkFrequency === 'daily_4'
                    ? 'Günde 4 kez'
                    : settings.checkFrequency === 'every_6h'
                    ? '6 saatte bir'
                    : settings.checkFrequency === 'every_3h'
                    ? '3 saatte bir'
                    : 'Manuel'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Arka Plan Modu:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  {settings.runInBackground ? 'Açık' : 'Kapalı'}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 pb-24 md:pb-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Status Notification Banner */}
            {bannerMessage && (
              <div className="px-4 py-2.5 rounded-lg bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 text-xs flex items-center justify-between">
                <span>{bannerMessage}</span>
                <button
                  onClick={() => setBannerMessage(null)}
                  className="text-slate-400 hover:text-white text-[11px]"
                >
                  Kapat
                </button>
              </div>
            )}

            {/* Selected Product Detail View (Section 24) */}
            {selectedProduct ? (
              <ProductDetailView
                product={selectedProduct}
                onBack={() => setSelectedProductId(null)}
                onRefreshData={fetchBootstrapData}
                onNavigateSettings={() => {
                  setSelectedProductId(null);
                  setActiveTab('settings');
                }}
                onDeleteProduct={handleDeleteProduct}
              />
            ) : (
              <>
                {/* DASHBOARD & TAKİP LİSTEM VIEWS */}
                {(activeTab === 'dashboard' || activeTab === 'watchlist') && (
                  <>
                    {/* First Run Welcome Screen when no products are tracked yet (Section 37) */}
                    {!isLoading && products.length === 0 ? (
                      <div className="p-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center max-w-xl mx-auto my-8 space-y-5">
                        <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
                          <Package className="w-7 h-7" />
                        </div>

                        <div className="space-y-2">
                          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                            Fiyat Takip Agent’a Hoş Geldiniz
                          </h1>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            Takip etmek istediğiniz ürünün bağlantısını ekleyin. Uygulama ürünü analiz eder, Türkiye’deki diğer e-ticaret mağazalarında eşleşen fiyatları karşılaştırır ve fiyat düştüğünde size bildirim gönderir.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <Plus className="w-4 h-4" />
                            <span>İlk Ürünü Ekle</span>
                          </button>

                          <button
                            onClick={handleLoadDeveloperSamples}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                          >
                            <span>Geliştirici Örnek Verilerini Yükle (Test Modu)</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-400 pt-2">
                          Hesap kaydı gerektirmez. Tüm verileriniz yerel SQLite veritabanında saklanır.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Summary Cards on Dashboard (Section 8) */}
                        {activeTab === 'dashboard' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Takip Edilen Ürünler
                              </span>
                              <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                                {summaryMetrics.trackedCount}
                              </p>
                              <span className="text-[11px] text-slate-400">
                                Toplam {products.length} kayıtlı ürün
                              </span>
                            </div>

                            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Bugün Fiyatı Düşenler
                              </span>
                              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                                {summaryMetrics.droppedTodayCount}
                              </p>
                              <span className="text-[11px] text-slate-400">
                                Son kontrol bazlı düşüşler
                              </span>
                            </div>

                            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                En Büyük Fiyat Düşüşü
                              </span>
                              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                                {summaryMetrics.maxDropPercent > 0
                                  ? `-%${summaryMetrics.maxDropPercent.toLocaleString('tr-TR')}`
                                  : '—'}
                              </p>
                              <span className="block text-[11px] text-slate-400 truncate">
                                {summaryMetrics.maxDropProductName}
                              </span>
                            </div>

                            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                Toplam Tasarruf Fırsatı
                              </span>
                              <p className="text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 mt-1">
                                {formatPriceTR(summaryMetrics.totalSavingsAmount, 'TRY', false)}
                              </p>
                              <span className="text-[11px] text-slate-400">
                                Önceki fiyatlara göre fark
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Search, Filter & Sort Toolbar (Section 26) */}
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            {/* Search Input */}
                            <div className="relative flex-1 min-w-[220px]">
                              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Ürün adı, marka, model veya kod ara…"
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                              />
                            </div>

                            {/* Store Filter */}
                            <div className="flex items-center gap-2">
                              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                              <select
                                value={storeFilter}
                                onChange={(e) => setStoreFilter(e.target.value)}
                                aria-label="Mağaza filtresi"
                                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                              >
                                <option value="ALL">Tüm Mağazalar</option>
                                {stores.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>

                              {/* Sort Selector */}
                              <select
                                value={sortBy}
                                onChange={(e) =>
                                  setSortBy(
                                    e.target.value as
                                      | 'largest_drop'
                                      | 'lowest_price'
                                      | 'recently_checked'
                                      | 'recently_added'
                                  )
                                }
                                aria-label="Sıralama ölçütü"
                                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                              >
                                <option value="recently_added">Sırala: Son eklenen</option>
                                <option value="largest_drop">
                                  Sırala: En büyük fiyat düşüşü
                                </option>
                                <option value="lowest_price">
                                  Sırala: En düşük güncel fiyat
                                </option>
                                <option value="recently_checked">
                                  Sırala: Son kontrol edilen
                                </option>
                              </select>
                            </div>
                          </div>

                          {/* Interactive Segmented Filter Bar */}
                          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg w-fit">
                            {[
                              { id: 'all', label: 'Tümü' },
                              { id: 'dropped', label: 'Fiyatı Düşenler' },
                              { id: 'target_reached', label: 'Hedefe Ulaşanlar' },
                              { id: 'out_of_stock', label: 'Tükenenler' },
                              { id: 'active', label: 'Takip Edilenler' },
                              { id: 'inactive', label: 'Durdurulanlar' },
                            ].map((f) => (
                              <button
                                key={f.id}
                                onClick={() =>
                                  setStatusFilter(
                                    f.id as
                                      | 'all'
                                      | 'dropped'
                                      | 'target_reached'
                                      | 'out_of_stock'
                                      | 'active'
                                      | 'inactive'
                                  )
                                }
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                  statusFilter === f.id
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                }`}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>

                         {/* Mobile iPhone Product Cards (visible on small screens for ergonomic touch usage) */}
                        <div className="md:hidden space-y-3">
                          {filteredProducts.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                              Seçili filtre kriterlerine uygun ürün bulunamadı.
                            </div>
                          ) : (
                            filteredProducts.map((p) => {
                              const change = calculatePriceChange(
                                p.previous_lowest_price,
                                p.current_lowest_price,
                                p.currency
                              );
                              const targetHit = isTargetPriceReached(
                                p.current_lowest_price,
                                p.target_price
                              );
                              const isCheckingThis = checkingProductId === p.id;

                              return (
                                <div
                                  key={p.id}
                                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
                                >
                                  <div className="flex items-start gap-3">
                                    <button
                                      onClick={() => setSelectedProductId(p.id)}
                                      className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden"
                                    >
                                      {p.image ? (
                                        <img
                                          src={p.image}
                                          alt={p.name}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-contain p-1"
                                        />
                                      ) : (
                                        <Package className="w-5 h-5 text-slate-400" />
                                      )}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <button
                                        onClick={() => setSelectedProductId(p.id)}
                                        className="text-left block w-full"
                                      >
                                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                                          {p.name}
                                        </p>
                                      </button>
                                      <p className="text-[11px] text-slate-500 mt-0.5">
                                        {p.current_lowest_store ||
                                          p.offers?.[0]?.store_name ||
                                          p.brand}
                                        {p.storage ? ` · ${p.storage}` : ''}
                                        {p.color ? ` · ${p.color}` : ''}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                    <div>
                                      <span className="block text-[10px] text-slate-400">
                                        Güncel Fiyat
                                      </span>
                                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                        {p.current_lowest_price !== null
                                          ? formatPriceTR(
                                              p.current_lowest_price,
                                              p.currency,
                                              false
                                            )
                                          : 'Kontrol edilemedi'}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400">
                                        Değişim
                                      </span>
                                      {change && !change.isUnchanged ? (
                                        <span
                                          className={`font-mono font-semibold ${
                                            change.isDecrease
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : 'text-rose-600 dark:text-rose-400'
                                          }`}
                                        >
                                          {change.formattedDiffPercent}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400">
                                        Hedef Fiyat
                                      </span>
                                      <span
                                        className={`font-mono ${
                                          targetHit
                                            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                            : 'text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        {p.target_price
                                          ? formatPriceTR(
                                              p.target_price,
                                              p.currency,
                                              false
                                            )
                                          : '—'}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                      onClick={() => setSelectedProductId(p.id)}
                                      className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>Görüntüle</span>
                                    </button>
                                    <button
                                      onClick={() => handleCheckSingleProduct(p.id)}
                                      disabled={isCheckingThis}
                                      className="min-h-[40px] px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg"
                                    >
                                      {isCheckingThis ? 'Kontrol…' : 'Şimdi Kontrol Et'}
                                    </button>
                                    <button
                                      onClick={() => handleToggleProductActive(p)}
                                      className="min-h-[40px] px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg"
                                    >
                                      {p.active ? 'Takibi Durdur' : 'Başlat'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* Product Tracking Table (Section 8) */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                                  <th className="py-3 px-4 font-medium">Ürün</th>
                                  <th className="py-3 px-3 font-medium">Mağaza</th>
                                  <th className="py-3 px-3 font-medium text-right">
                                    Güncel Fiyat
                                  </th>
                                  <th className="py-3 px-3 font-medium text-right">
                                    Önceki Fiyat
                                  </th>
                                  <th className="py-3 px-3 font-medium text-right">
                                    Değişim
                                  </th>
                                  <th className="py-3 px-3 font-medium text-right">
                                    Hedef Fiyat
                                  </th>
                                  <th className="py-3 px-3 font-medium">Son Kontrol</th>
                                  <th className="py-3 px-3 font-medium">Durum</th>
                                  <th className="py-3 px-4 font-medium text-right">
                                    İşlemler
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                {filteredProducts.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={9}
                                      className="py-8 text-center text-slate-400"
                                    >
                                      Seçili filtre kriterlerine uygun ürün bulunamadı.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredProducts.map((p) => {
                                    const change = calculatePriceChange(
                                      p.previous_lowest_price,
                                      p.current_lowest_price,
                                      p.currency
                                    );
                                    const targetHit = isTargetPriceReached(
                                      p.current_lowest_price,
                                      p.target_price
                                    );
                                    const isCheckingThis = checkingProductId === p.id;

                                    return (
                                      <tr
                                        key={p.id}
                                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                                      >
                                        <td className="py-3 px-4">
                                          <button
                                            onClick={() => setSelectedProductId(p.id)}
                                            className="text-left group flex items-center gap-3 max-w-xs"
                                          >
                                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                                              {p.image ? (
                                                <img
                                                  src={p.image}
                                                  alt={p.name}
                                                  referrerPolicy="no-referrer"
                                                  className="w-full h-full object-contain p-0.5"
                                                />
                                              ) : (
                                                <Package className="w-4 h-4 text-slate-400" />
                                              )}
                                            </div>
                                            <div className="min-w-0">
                                              <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 truncate transition-colors">
                                                {p.name}
                                              </p>
                                              <p className="text-[11px] text-slate-500 truncate">
                                                {p.brand}
                                                {p.storage ? ` · ${p.storage}` : ''}
                                                {p.color ? ` · ${p.color}` : ''}
                                              </p>
                                            </div>
                                          </button>
                                        </td>

                                        <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                          {p.current_lowest_store ||
                                            p.offers?.[0]?.store_name ||
                                            '—'}
                                        </td>

                                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                          {p.current_lowest_price !== null ? (
                                            <span className="font-bold text-slate-900 dark:text-slate-100">
                                              {formatPriceTR(
                                                p.current_lowest_price,
                                                p.currency,
                                                false
                                              )}
                                            </span>
                                          ) : (
                                            <span className="font-sans text-[11px] text-amber-600 dark:text-amber-400">
                                              Kontrol edilemedi
                                            </span>
                                          )}
                                        </td>

                                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                                          {p.previous_lowest_price
                                            ? formatPriceTR(
                                                p.previous_lowest_price,
                                                p.currency,
                                                false
                                              )
                                            : '—'}
                                        </td>

                                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                          {change && !change.isUnchanged ? (
                                            <span
                                              className={`font-semibold ${
                                                change.isDecrease
                                                  ? 'text-emerald-600 dark:text-emerald-400'
                                                  : 'text-rose-600 dark:text-rose-400'
                                              }`}
                                            >
                                              {change.formattedDiffAmount} (
                                              {change.formattedDiffPercent})
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>

                                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                          {p.target_price ? (
                                            <span
                                              className={
                                                targetHit
                                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                                  : 'text-slate-700 dark:text-slate-300'
                                              }
                                            >
                                              {targetHit ? '🎯 ' : ''}
                                              {formatPriceTR(
                                                p.target_price,
                                                p.currency,
                                                false
                                              )}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>

                                        <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                                          {p.last_checked_at
                                            ? new Date(
                                                p.last_checked_at
                                              ).toLocaleTimeString('tr-TR', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                              })
                                            : '—'}
                                        </td>

                                        <td className="py-3 px-3 whitespace-nowrap">
                                          {p.has_suspicious_price ? (
                                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                              Şüpheli fiyat
                                            </span>
                                          ) : p.availability_summary === 'Tükendi' ? (
                                            <span className="text-rose-600 dark:text-rose-400 font-medium">
                                              Tükendi
                                            </span>
                                          ) : p.active ? (
                                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                              Takip Ediliyor
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">
                                              Durduruldu
                                            </span>
                                          )}
                                        </td>

                                        {/* Table Actions: Görüntüle, Ayarlar, Takibi Durdur (Section 8 & 23) */}
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                          <div className="inline-flex items-center justify-end gap-1.5">
                                            <button
                                              onClick={() =>
                                                handleCheckSingleProduct(p.id)
                                              }
                                              disabled={isCheckingThis}
                                              title="Şimdi Kontrol Et"
                                              className="px-2 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                            >
                                              {isCheckingThis
                                                ? 'Kontrol…'
                                                : 'Şimdi Kontrol Et'}
                                            </button>

                                            <button
                                              onClick={() => setSelectedProductId(p.id)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded hover:opacity-90 transition-opacity"
                                            >
                                              <Eye className="w-3 h-3" />
                                              <span>Görüntüle</span>
                                            </button>

                                            <button
                                              onClick={() => {
                                                setSelectedProductId(p.id);
                                              }}
                                              title="Ürün Hedef ve Bildirim Ayarları"
                                              className="px-2 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                            >
                                              Ayarlar
                                            </button>

                                            <button
                                              onClick={() =>
                                                handleToggleProductActive(p)
                                              }
                                              className="px-2 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                            >
                                              {p.active
                                                ? 'Takibi Durdur'
                                                : 'Takibi Başlat'}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* FİYAT DÜŞÜŞLERİ PAGE (Section 35) */}
                {activeTab === 'drops' && (
                  <div className="space-y-5">
                    <div>
                      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Fiyat Düşüşleri Geçmişi
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Takip edilen ürünlerde bugüne kadar tespit edilen tüm doğrulanmış fiyat düşüşü olayları.
                      </p>
                    </div>

                    {priceDrops.length === 0 ? (
                      <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                        Henüz kaydedilmiş bir fiyat düşüşü olayı bulunmuyor.
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                              <th className="py-3 px-4 font-medium">Tarih</th>
                              <th className="py-3 px-4 font-medium">Ürün</th>
                              <th className="py-3 px-4 font-medium">Mağaza</th>
                              <th className="py-3 px-4 font-medium text-right">
                                Fiyat Değişimi
                              </th>
                              <th className="py-3 px-4 font-medium text-right">
                                Düşüş Oranı
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {priceDrops.map((drop) => (
                              <tr
                                key={drop.id}
                                onClick={() => setSelectedProductId(drop.product_id)}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                              >
                                <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                                  {new Date(drop.checked_at).toLocaleDateString(
                                    'tr-TR',
                                    {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                    }
                                  )}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                                  {drop.product_name}
                                </td>
                                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                                  {drop.store_name}
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums">
                                  <span className="line-through text-slate-400">
                                    {formatPriceTR(
                                      drop.old_price,
                                      drop.currency,
                                      false
                                    )}
                                  </span>{' '}
                                  →{' '}
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatPriceTR(
                                      drop.new_price,
                                      drop.currency,
                                      false
                                    )}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                                  -%{drop.drop_percent.toLocaleString('tr-TR')} (
                                  -{formatPriceTR(drop.drop_amount, drop.currency, false)})
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* MAĞAZALAR PAGE (Section 5 & 36) */}
                {activeTab === 'stores' && (
                  <div className="space-y-5">
                    <div>
                      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Desteklenen E-Ticaret Mağazaları
                      </h1>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Modüler mağaza adaptörleri ve gerçek zamanlı bağlantı durumları. Bir mağaza fiilen kontrol edilmeden “Çalışıyor” olarak işaretlenmez.
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                            <th className="py-3 px-4 font-medium">Mağaza Adı</th>
                            <th className="py-3 px-4 font-medium">Alan Adı</th>
                            <th className="py-3 px-4 font-medium">Bağlantı Durumu</th>
                            <th className="py-3 px-4 font-medium">
                              Son Başarılı Kontrol
                            </th>
                            <th className="py-3 px-4 font-medium text-right">
                              Takip Edilen Teklif
                            </th>
                            <th className="py-3 px-4 font-medium text-right">
                              Durum / Test
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                          {stores.map((store) => (
                            <tr
                              key={store.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                            >
                              <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                                {store.name}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-500">
                                {store.domain}
                              </td>
                              <td className="py-3 px-4">
                                {store.status === 'operational' ? (
                                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Çalışıyor</span>
                                  </span>
                                ) : store.status === 'unavailable' ? (
                                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>Geçici olarak kullanılamıyor</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Henüz kontrol edilmedi
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-500">
                                {store.last_successful_check
                                  ? new Date(
                                      store.last_successful_check
                                    ).toLocaleString('tr-TR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : '—'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                                {store.tracked_offers_count || 0}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={async () => {
                                      setCheckingStoreId(store.id);
                                      try {
                                        await fetch(
                                          `/api/stores/${store.id}/health-check`,
                                          { method: 'POST' }
                                        );
                                        await fetchBootstrapData();
                                      } finally {
                                        setCheckingStoreId(null);
                                      }
                                    }}
                                    disabled={checkingStoreId === store.id}
                                    className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                                  >
                                    {checkingStoreId === store.id
                                      ? 'Test Ediliyor…'
                                      : 'Bağlantıyı Test Et'}
                                  </button>

                                  <button
                                    onClick={async () => {
                                      await fetch(`/api/stores/${store.id}`, {
                                        method: 'PATCH',
                                        headers: {
                                          'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                          enabled: !store.enabled,
                                        }),
                                      });
                                      await fetchBootstrapData();
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                                      store.enabled
                                        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                                        : 'text-slate-400 bg-slate-100 dark:bg-slate-800'
                                    }`}
                                  >
                                    {store.enabled ? 'Aktif' : 'Devre Dışı'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* BİLDİRİMLER PAGE (Section 12) */}
                {activeTab === 'notifications' && (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Bildirim Geçmişi
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Fiyat düşüşü, hedef fiyat, stok yenilenmesi ve yeni en düşük mağaza bildirimleri.
                        </p>
                      </div>

                      {notifications.length > 0 && (
                        <button
                          onClick={async () => {
                            await fetch('/api/notifications/mark-read', {
                              method: 'POST',
                            });
                            await fetchBootstrapData();
                          }}
                          className="px-3.5 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                          Tümünü Okundu İşaretle
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                        Henüz gönderilmiş bir bildirim bulunmuyor.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-4 rounded-xl bg-white dark:bg-slate-900 border transition-colors flex flex-wrap items-center justify-between gap-4 ${
                              !n.read
                                ? 'border-emerald-400 dark:border-emerald-700'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  {n.title}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">
                                  Mağaza: {n.store_name || 'Trendyol'}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="font-mono text-slate-400">
                                  {new Date(n.created_at).toLocaleString('tr-TR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>

                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {n.product_name || n.message}
                              </p>

                              {n.old_price && n.new_price && (
                                <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                                  <span className="line-through text-slate-400">
                                    {formatPriceTR(n.old_price, n.currency, false)}
                                  </span>{' '}
                                  →{' '}
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                    {formatPriceTR(n.new_price, n.currency, false)}
                                  </span>
                                  {n.drop_amount && n.drop_amount > 0 && (
                                    <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                      (Düşüş:{' '}
                                      {formatPriceTR(
                                        n.drop_amount,
                                        n.currency,
                                        false
                                      )}{' '}
                                      / %
                                      {Math.abs(n.drop_percent || 0).toLocaleString(
                                        'tr-TR'
                                      )}
                                      )
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {n.product_id && (
                                <button
                                  onClick={() => setSelectedProductId(n.product_id)}
                                  className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                                >
                                  Detaylar
                                </button>
                              )}
                              {n.product_url && (
                                <a
                                  href={n.product_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 rounded-lg hover:opacity-90"
                                >
                                  <span>Ürünü Aç</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* AYARLAR PAGE (Section 29) */}
                {activeTab === 'settings' && (
                  <SettingsView
                    settings={settings}
                    products={products}
                    onUpdateSettings={handleUpdateSettings}
                    onRefreshAll={fetchBootstrapData}
                    onShowToast={(notif) => setActiveToast(notif)}
                  />
                )}

                {/* HAKKINDA PAGE (Section 28) */}
                {activeTab === 'about' && (
                  <div className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 max-w-2xl">
                    <div className="flex items-center gap-3">
                      <img
                        src="/icon.svg"
                        alt="Fiyat Takip Agent İkonu"
                        className="w-12 h-12 rounded-xl"
                      />
                      <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          Fiyat Takip Agent
                        </h1>
                        <p className="text-xs text-slate-500">
                          Sürüm 1.0.0 · macOS (Apple Silicon & Intel) ve Windows Masaüstü Uygulaması
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Fiyat Takip Agent, Türkiye’deki e-ticaret mağazalarında (Trendyol, Hepsiburada, Amazon Türkiye, N11, ÇiçekSepeti, MediaMarkt Türkiye, Teknosa, Vatan Bilgisayar, Pazarama, Akakçe ve Cimri) ürün fiyatlarını günlük olarak kontrol eden, kesin ürün eşleştirmesi yapan ve fiyat düştüğünde size yerel bildirim gönderen masaüstü uygulamasıdır.
                    </p>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-semibold block text-slate-800 dark:text-slate-200">
                          Veri Gizliliği ve Yerel Depolama
                        </span>
                        <span className="text-slate-500">
                          Tüm veriler yerel SQLite veritabanında tutulur. Hiçbir harici sunucuya kişisel veri gönderilmez.
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold block text-slate-800 dark:text-slate-200">
                          Doğruluk ve Şeffaflık İlkesi
                        </span>
                        <span className="text-slate-500">
                          Erişilemeyen mağazalar için asla tahmini veya sahte fiyat üretilmez; doğrulanmış fiyatlar ile son bilinen fiyatlar açıkça ayrılır.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Add Product Modal (Section 7) */}
      <AddProductModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onProductAdded={async (product) => {
          await fetchBootstrapData();
          setSelectedProductId(product.id);
        }}
      />

      {/* macOS Menu Bar Popover (Section 16) */}
      <MenuBarPopover
        isOpen={isMenuBarOpen}
        onClose={() => setIsMenuBarOpen(false)}
        isMinimizedToTray={false}
        onRestoreWindow={() => setIsMinimizedToTray(false)}
        onCheckAllPrices={handleCheckAllPrices}
        onNavigate={(tab) => {
          setSelectedProductId(null);
          setActiveTab(tab as NavTab);
        }}
        onQuitApp={() => setIsMinimizedToTray(true)}
        activeProductsCount={summaryMetrics.trackedCount}
        isCheckingAll={isCheckingAll}
      />

      {/* Native-style Toast Alert (Section 12) */}
      <NotificationToast
        notification={activeToast}
        onClose={() => setActiveToast(null)}
        onOpenProduct={(productId, url) => {
          if (productId) {
            setSelectedProductId(productId);
          } else if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
        }}
      />

      {/* iPhone / Mobile Bottom Tab Navigation Bar */}
      <nav
        aria-label="Mobil Alt Gezinme Çubuğu"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-6 h-14">
          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('dashboard');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'dashboard' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Özet</span>
          </button>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('watchlist');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'watchlist' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            <span>Takip ({products.length})</span>
          </button>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('drops');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'drops' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Düşüşler</span>
          </button>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('stores');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'stores' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Mağazalar</span>
          </button>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('notifications');
            }}
            className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'notifications' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Bildirim</span>
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            onClick={() => {
              setSelectedProductId(null);
              setActiveTab('settings');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'settings' && !selectedProductId
                ? 'text-sky-600 dark:text-sky-400 font-semibold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Ayarlar</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
