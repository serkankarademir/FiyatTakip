import React from 'react';
import {
  CheckCircle2,
  ListFilter,
  Power,
  RefreshCw,
  Settings,
  Maximize2,
} from 'lucide-react';

interface MenuBarPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  isMinimizedToTray: boolean;
  onRestoreWindow: () => void;
  onCheckAllPrices: () => void;
  onNavigate: (tab: string) => void;
  onQuitApp: () => void;
  activeProductsCount: number;
  isCheckingAll: boolean;
}

export const MenuBarPopover: React.FC<MenuBarPopoverProps> = ({
  isOpen,
  onClose,
  isMinimizedToTray,
  onRestoreWindow,
  onCheckAllPrices,
  onNavigate,
  onQuitApp,
  activeProductsCount,
  isCheckingAll,
}) => {
  if (!isOpen && !isMinimizedToTray) return null;

  return (
    <div className="fixed top-10 right-6 z-50 w-64 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl py-2 text-sm">
      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
            Fiyat Takip Agent
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            Aktif ({activeProductsCount})
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          macOS Menü Çubuğu Arka Plan Servisi
        </p>
      </div>

      <div className="py-1">
        <button
          onClick={() => {
            onCheckAllPrices();
            onClose();
          }}
          disabled={isCheckingAll}
          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
          <span>Fiyatları Kontrol Et</span>
        </button>

        <button
          onClick={() => {
            onRestoreWindow();
            onNavigate('watchlist');
            onClose();
          }}
          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>Takip Listesi</span>
        </button>

        <button
          onClick={() => {
            onRestoreWindow();
            onNavigate('settings');
            onClose();
          }}
          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Ayarlar</span>
        </button>

        <button
          onClick={() => {
            onRestoreWindow();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Uygulamayı Aç</span>
        </button>
      </div>

      <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
        <button
          onClick={() => {
            onQuitApp();
            onClose();
          }}
          className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
        >
          <Power className="w-3.5 h-3.5" />
          <span>Çıkış</span>
        </button>
      </div>
    </div>
  );
};
