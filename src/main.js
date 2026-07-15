import { app, BrowserWindow, ipcMain, net, protocol, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { createJournalStore } from './journal-store.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Media is served through a private protocol. Marking it as a stream before
// app readiness lets Chromium use byte-range loading for video controls.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'journal-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let mainWindow = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#181818',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  const createdWindow = mainWindow;
  createdWindow.on('closed', () => {
    if (mainWindow === createdWindow) mainWindow = null;
  });
  return createdWindow;
};

let journalStore;
let journalStoreError = '';

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // The renderer only asks for this when opening a journal page. All other
  // permissions remain denied, so a web page loaded by the app cannot obtain
  // unrelated system access.
  const isJournalRenderer = (webContents) => {
    if (webContents !== mainWindow?.webContents) return false;
    const url = webContents.getURL();
    return MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      : url.startsWith('file:');
  };
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    permission === 'geolocation' && isJournalRenderer(webContents)
  ));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation' && isJournalRenderer(webContents));
  });

  try {
    journalStore = createJournalStore({ dataDirectory: app.getPath('userData') });
    protocol.handle('journal-media', (request) => {
      const mediaPath = journalStore.resolveMediaPath(request.url);
      return mediaPath ? net.fetch(pathToFileURL(mediaPath).toString()) : new Response('Not found', { status: 404 });
    });
  } catch (error) {
    journalStoreError = error instanceof Error ? error.message : String(error);
    console.error('Journal storage is unavailable:', error);
  }

  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('journal:load', (_event, entryDate) => journalStore?.load(entryDate) ?? null);
ipcMain.handle('journal:save', (_event, entry) => journalStore?.save(entry) ?? { saved: false });
ipcMain.handle('journal:remove', (_event, entryDate) => journalStore?.remove(entryDate));
ipcMain.handle('journal:import-media', (_event, media) => journalStore?.importMedia(media));
ipcMain.handle('journal:status', () => ({
  available: Boolean(journalStore),
  error: journalStoreError,
}));

ipcMain.on('window:minimize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.minimize();
});

ipcMain.on('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
    return;
  }

  window.maximize();
});

ipcMain.on('window:close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.close();
});

ipcMain.handle('window:is-maximized', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window?.isMaximized() ?? false;
});

const emitWindowState = (window) => {
  window.webContents.send('window:maximized-changed', window.isMaximized());
};

app.on('browser-window-created', (_, window) => {
  window.on('maximize', () => emitWindowState(window));
  window.on('unmaximize', () => emitWindowState(window));
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => journalStore?.close());

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
