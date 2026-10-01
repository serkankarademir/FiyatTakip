/**
 * Electron Main Process for Fiyat Takip Agent (macOS Apple Silicon, Intel & Windows)
 * Manages BrowserWindow, macOS Menu Bar Tray, background execution ("Arka planda çalış"),
 * launch at login ("Başlangıçta aç"), and native OS notifications.
 */
const { app, BrowserWindow, Tray, Menu, Notification, shell, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let runInBackground = true;

const PORT = process.env.PORT || 3000;

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, '../public/icon.svg');
  try {
    tray = new Tray(iconPath);
  } catch {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Fiyatları Kontrol Et',
      click: () => {
        fetch(`http://127.0.0.1:${PORT}/api/check-all`, { method: 'POST' }).catch(() => {});
      },
    },
    {
      label: 'Takip Listesi',
      click: () => {
        showMainWindow();
      },
    },
    {
      label: 'Ayarlar',
      click: () => {
        showMainWindow();
      },
    },
    { type: 'separator' },
    {
      label: 'Uygulamayı Aç',
      click: () => {
        showMainWindow();
      },
    },
    {
      label: 'Çıkış',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Fiyat Takip Agent — İnternetteki ürün fiyatlarını otomatik takip edin.');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    title: 'Fiyat Takip Agent',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  // Open external store links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && runInBackground) {
      event.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin' && app.dock) {
        app.dock.hide();
      }
    }
  });
}

ipcMain.handle('fta:notify', (_event, payload) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: payload.title || 'Fiyat Takip Agent',
      body: payload.body || '',
    });
    n.on('click', () => {
      showMainWindow();
      if (payload.url) {
        shell.openExternal(payload.url);
      }
    });
    n.show();
  }
});

ipcMain.handle('fta:set-background-mode', (_event, enabled) => {
  runInBackground = Boolean(enabled);
});

ipcMain.handle('fta:set-login-item', (_event, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin) });
});

app.whenReady().then(() => {
  createTray();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      showMainWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !runInBackground) {
    app.quit();
  }
});
