const { app, BrowserWindow, Tray, Menu, shell, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;
let runInBackground = true;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;

function startEmbeddedBackend() {
  const isPackaged = app.isPackaged;
  const serverScript = isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js')
    : path.join(__dirname, '..', 'server.ts');

  const userDataDir = app.getPath('userData');
  const defaultDbPath = path.join(userDataDir, 'data', 'fiyat_takip.sqlite');

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: isPackaged ? 'production' : (process.env.NODE_ENV || 'development'),
    DATABASE_PATH: process.env.DATABASE_PATH || defaultDbPath,
    ELECTRON_RUN_AS_NODE: '1',
  };

  if (isPackaged) {
    serverProcess = spawn(process.execPath, [serverScript], {
      env,
      stdio: 'inherit',
    });
  } else {
    // In local desktop dev, if server is not already running, start it via npx tsx
    serverProcess = spawn('npx', ['tsx', serverScript], {
      cwd: path.join(__dirname, '..'),
      env: { ...env, ELECTRON_RUN_AS_NODE: undefined },
      stdio: 'inherit',
      shell: true,
    });
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'pwa-192x192.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Fiyat Takip Agent');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Fiyat Takip Agent Penceresini Aç',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Çıkış Yap',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'Fiyat Takip Agent',
    backgroundColor: '#0F172A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && runInBackground && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

ipcMain.on('show-notification', (_event, payload) => {
  if (Notification.isSupported() && payload && payload.title) {
    const notif = new Notification({
      title: String(payload.title),
      body: String(payload.body || ''),
    });
    notif.on('click', () => {
      if (payload.url) {
        shell.openExternal(payload.url);
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notif.show();
  }
});

ipcMain.on('set-run-in-background', (_event, enabled) => {
  runInBackground = Boolean(enabled);
});

ipcMain.on('set-launch-at-startup', (_event, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
    });
  } catch {
    // Ignore on unsupported platforms
  }
});

app.whenReady().then(() => {
  startEmbeddedBackend();
  createTray();
  setTimeout(createWindow, 1200);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {
      // Ignore
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || !runInBackground) {
    app.quit();
  }
});
