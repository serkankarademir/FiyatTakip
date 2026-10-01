/**
 * Runtime environment detection utilities for Web vs Desktop (Electron) separation.
 * Ensures Electron-specific functionality never executes in a normal web browser.
 */

export interface ElectronBridgeAPI {
  isElectron?: boolean;
  platform?: string;
  openExternal?: (url: string) => Promise<void>;
  showNotification?: (payload: { title: string; body: string; url?: string }) => void;
  setRunInBackground?: (enabled: boolean) => void;
  setLaunchAtStartup?: (enabled: boolean) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
  }
}

/**
 * Returns true only when the React frontend is running inside the desktop Electron shell.
 */
export function isElectron(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.electronAPI?.isElectron) {
    return true;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    return navigator.userAgent.toLowerCase().includes('electron');
  }
  return false;
}
