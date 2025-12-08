const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const { startServer, stopServer, setEmuSettings } = require('./server/server');

let mainWindow = null;
let serverRunning = false;

const DEFAULT_SETTINGS = {
  characterName: '[DEV]Kijuwoo~',
  gender: 2,
  honeyName: '',
  eventId: 5,
};

let settingsFilePath = null;
let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    if (!settingsFilePath) return;
    const raw = fs.readFileSync(settingsFilePath, 'utf8');
    const json = JSON.parse(raw);

    currentSettings = { ...DEFAULT_SETTINGS, ...json };
    console.log('[SETTINGS] Loaded from disk:', JSON.stringify(currentSettings));
  } catch (err) {
    console.log('[SETTINGS] Using default settings (no saved file yet).');
    currentSettings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    if (!settingsFilePath) return;
    fs.writeFileSync(
      settingsFilePath,
      JSON.stringify(currentSettings, null, 2),
      'utf8'
    );
    console.log('[SETTINGS] Saved to disk:', JSON.stringify(currentSettings));
  } catch (err) {
    console.error('[SETTINGS] Failed to save settings:', err);
  }
}

const origLog = console.log;
function sendLogToRenderer(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-line', line);
  }
}

console.log = (...args) => {
  const msg = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  origLog(msg);
  sendLogToRenderer(msg);
};

process.on('uncaughtException', (err) => {
  origLog('[MAIN] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  origLog('[MAIN] Unhandled rejection:', reason);
});

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 800,
    minHeight: 500,
    icon: iconPath,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('settings:init', currentSettings);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  settingsFilePath = path.join(app.getPath('userData'), 'emu-settings.json');

  loadSettings();              
  setEmuSettings(currentSettings);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('settings:changed', (_event, settings) => {
  try {
    currentSettings = { ...currentSettings, ...settings };
    setEmuSettings(currentSettings);
    saveSettings();
  } catch (err) {
    console.error('[MAIN] Error applying settings:', err);
  }
});

ipcMain.handle('server:start', async () => {
  if (serverRunning) {
    return { ok: true, alreadyRunning: true };
  }

  try {
    await startServer();
    serverRunning = true;
    return { ok: true };
  } catch (err) {
    console.error('[MAIN] server:start failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('server:stop', async () => {
  if (!serverRunning) {
    return { ok: true, alreadyStopped: true };
  }

  try {
    await stopServer();
    serverRunning = false;
    return { ok: true };
  } catch (err) {
    console.error('[MAIN] server:stop failed:', err);
    return { ok: false, error: err.message || String(err) };
  }
});
