import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { createJournalStore } from './journal-store.js';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.renyh.onepage');
}

const appDataDirectory = app.getPath('appData');
const legacyUserDataDirectory = path.join(appDataDirectory, '一页');
const stableUserDataDirectory = path.join(appDataDirectory, 'one-page');
const developmentUserDataDirectory = path.join(appDataDirectory, 'one-page-dev');
const isDevelopment = !app.isPackaged;
const legacyDatabasePath = path.join(legacyUserDataDirectory, 'journal', 'journal.db');
const stableDatabasePath = path.join(stableUserDataDirectory, 'journal', 'journal.db');

// The visible application name is Chinese, but an ASCII data path is easier to
// back up and support. Preserve existing journals by copying them once before
// selecting the new location; the legacy directory is deliberately retained.
const migrateLegacyUserData = () => {
  const legacySettingsPath = path.join(legacyUserDataDirectory, 'settings.json');
  const stableSettingsPath = path.join(stableUserDataDirectory, 'settings.json');
  const hasLegacyData = fs.existsSync(legacyDatabasePath) || fs.existsSync(legacySettingsPath);
  if (!hasLegacyData || fs.existsSync(stableDatabasePath)) return;

  fs.mkdirSync(stableUserDataDirectory, { recursive: true });
  for (const part of ['journal', 'journal-media']) {
    const source = path.join(legacyUserDataDirectory, part);
    const destination = path.join(stableUserDataDirectory, part);
    if (fs.existsSync(source) && !fs.existsSync(destination)) fs.cpSync(source, destination, { recursive: true });
  }
  if (fs.existsSync(legacySettingsPath) && !fs.existsSync(stableSettingsPath)) {
    fs.copyFileSync(legacySettingsPath, stableSettingsPath);
    const settings = JSON.parse(fs.readFileSync(stableSettingsPath, 'utf8'));
    if (settings.dataDirectory && path.resolve(settings.dataDirectory) === path.resolve(legacyUserDataDirectory)) {
      settings.dataDirectory = stableUserDataDirectory;
      fs.writeFileSync(stableSettingsPath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
  }
};

if (isDevelopment) {
  // Keep development data isolated so local testing cannot alter production journals.
  app.setPath('userData', developmentUserDataDirectory);
} else {
  try {
    migrateLegacyUserData();
    app.setPath('userData', stableUserDataDirectory);
  } catch (error) {
    console.error('Unable to migrate legacy user data; continuing with the legacy location:', error);
    app.setPath('userData', legacyUserDataDirectory);
  }
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
const githubRepository = 'LeoMorrison2001/one_page';
let updateState = { status: 'idle', version: null, downloaded: 0, total: 0, installerPath: null, asset: null };

const updateStateSnapshot = () => ({
  status: updateState.status,
  version: updateState.version,
  downloaded: updateState.downloaded,
  total: updateState.total,
});

const setUpdateState = (nextState) => {
  updateState = { ...updateState, ...nextState };
  mainWindow?.webContents.send('updates:state', updateStateSnapshot());
};

// Squirrel installs the app inside an app-<version> folder next to Update.exe.
// The ZIP build does not include that updater, so it must never try to replace
// its own running executable.
const isSquirrelInstall = () => process.platform === 'win32'
  && app.isPackaged
  && fs.existsSync(path.join(path.dirname(process.execPath), '..', 'Update.exe'));

const compareVersions = (left, right) => {
  const parts = (value) => String(value).replace(/^v/, '').split('-')[0].split('.').map((part) => Number(part) || 0);
  const leftParts = parts(left);
  const rightParts = parts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if ((leftParts[index] || 0) !== (rightParts[index] || 0)) return (leftParts[index] || 0) - (rightParts[index] || 0);
  }
  return 0;
};

const checkPortableUpdate = async ({ showDialog = false } = {}) => {
  if (!app.isPackaged) return { status: 'development' };
  try {
    const response = await net.fetch(`https://api.github.com/repos/${githubRepository}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    const latestVersion = release.tag_name;
    const available = compareVersions(latestVersion, app.getVersion()) > 0;
    if (showDialog && available) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['前往下载', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '发现新版本',
        message: `一页 ${latestVersion} 已发布`,
        detail: '绿色版不能在运行时替换自身。下载新版 ZIP 后，解压并覆盖当前程序文件即可；日记数据不会受影响。',
      });
      if (result.response === 0) await shell.openExternal(release.html_url);
    }
    return { status: available ? 'available' : 'up-to-date', latestVersion };
  } catch (error) {
    console.error('Unable to check portable update:', error);
    return { status: 'error' };
  }
};

const findLatestInstaller = async () => {
  const response = await net.fetch(`https://api.github.com/repos/${githubRepository}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const release = await response.json();
  const asset = release.assets?.find((item) => /-windows-x64-setup\.exe$/i.test(item.name));
  if (!asset?.browser_download_url) throw new Error('Release does not contain a Windows installer');
  return { version: release.tag_name, asset };
};

const checkInstalledUpdate = async () => {
  if (updateState.status === 'downloading') return updateStateSnapshot();
  setUpdateState({ status: 'checking', version: null, downloaded: 0, total: 0, installerPath: null, asset: null });
  try {
    const { version, asset } = await findLatestInstaller();
    if (compareVersions(version, app.getVersion()) <= 0) {
      setUpdateState({ status: 'up-to-date' });
      return updateStateSnapshot();
    }
    setUpdateState({ status: 'available', version, asset });
    return updateStateSnapshot();
  } catch (error) {
    console.error('Unable to check installed update:', error);
    setUpdateState({ status: 'error' });
    return updateStateSnapshot();
  }
};

const downloadInstalledUpdate = async () => {
  if (updateState.status !== 'available' || !updateState.asset) throw new Error('No update is ready to download');
  const { asset } = updateState;
  const temporaryPath = path.join(app.getPath('temp'), asset.name);
  const output = fs.createWriteStream(temporaryPath);
  const hash = createHash('sha256');
  setUpdateState({ status: 'downloading', downloaded: 0, total: 0, installerPath: null });
  try {
    const response = await net.fetch(asset.browser_download_url);
    if (!response.ok || !response.body) throw new Error(`Download returned ${response.status}`);
    const total = Number(response.headers.get('content-length')) || 0;
    let downloaded = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      hash.update(chunk);
      downloaded += chunk.length;
      if (!output.write(chunk)) await new Promise((resolve) => output.once('drain', resolve));
      setUpdateState({ downloaded, total });
    }
    await new Promise((resolve, reject) => output.end((error) => (error ? reject(error) : resolve())));
    const expectedDigest = typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : '';
    if (expectedDigest && hash.digest('hex') !== expectedDigest) throw new Error('Installer checksum verification failed');
    setUpdateState({ status: 'ready', installerPath: temporaryPath });
  } catch (error) {
    output.destroy();
    fs.rmSync(temporaryPath, { force: true });
    console.error('Unable to download update:', error);
    setUpdateState({ status: 'error' });
  }
  return updateStateSnapshot();
};

const installDownloadedUpdate = () => {
  if (updateState.status !== 'ready' || !updateState.installerPath) throw new Error('Update has not finished downloading');
  const installer = spawn(updateState.installerPath, [], { detached: true, stdio: 'ignore' });
  installer.unref();
  app.quit();
};

const configureUpdates = () => {
  if (!app.isPackaged || process.platform !== 'win32') return;
  setTimeout(() => {
    if (isSquirrelInstall()) checkInstalledUpdate();
    else checkPortableUpdate({ showDialog: true });
  }, 10_000);
};
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'app-icon.png')
  : path.join(__dirname, '../../assets/app-icon.png');

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1200,
    minHeight: 820,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#181818',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep developer tools available while developing, but do not expose
      // them in distributed builds.
      devTools: !app.isPackaged,
    },
  });

  // Prevent Chromium's developer-tool shortcuts from reaching packaged
  // builds. `devTools: false` is the actual capability gate; this also avoids
  // the shortcut appearing to work for users of the installed app.
  if (app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut = input.type === 'keyDown'
        && (input.key === 'F12'
          || ((input.control || input.meta) && input.shift && ['I', 'J', 'C'].includes(input.key.toUpperCase())));
      if (isDevToolsShortcut) event.preventDefault();
    });
  }

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
let journalDataDirectory = '';
let settingsPath = '';
let appSettings = { theme: 'light', dataDirectory: null, security: null };

const journalDataParts = ['journal', 'journal-media'];

const readAppSettings = () => {
  try {
    return { ...appSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) };
  } catch {
    return { ...appSettings };
  }
};

const saveAppSettings = () => {
  fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2), { encoding: 'utf8', mode: 0o600 });
};

const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 6 || password.length > 256) {
    throw new Error('密码长度应为 6 到 256 个字符');
  }
};

const passwordIsCorrect = (password) => {
  const security = appSettings.security;
  if (!security?.salt || !security?.passwordHash || typeof password !== 'string') return false;
  try {
    const stored = Buffer.from(security.passwordHash, 'hex');
    const candidate = Buffer.from(passwordHash(password, security.salt), 'hex');
    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  } catch {
    return false;
  }
};

const savePassword = (password) => {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  appSettings = {
    ...appSettings,
    security: { salt, passwordHash: passwordHash(password, salt) },
  };
  saveAppSettings();
};

const normalizedDirectory = (directory) => path.resolve(directory);

const dataPartPath = (directory, part) => path.join(directory, part);

const deleteJournalData = (directory) => {
  journalDataParts.forEach((part) => fs.rmSync(dataPartPath(directory, part), { recursive: true, force: true }));
};

const copyJournalData = (sourceDirectory, destinationDirectory) => {
  for (const part of journalDataParts) {
    const source = dataPartPath(sourceDirectory, part);
    const destination = dataPartPath(destinationDirectory, part);
    if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  }
};

const configureJournalStore = (dataDirectory) => {
  journalStore?.close();
  journalStore = createJournalStore({ dataDirectory });
  journalDataDirectory = dataDirectory;
};

const getSettingsSnapshot = () => ({
  theme: appSettings.theme,
  dataDirectory: journalDataDirectory,
  defaultDataDirectory: app.getPath('userData'),
  version: app.getVersion(),
});

const migrateJournalData = (targetDirectory) => {
  const source = normalizedDirectory(journalDataDirectory);
  const target = normalizedDirectory(targetDirectory);
  if (source === target) return getSettingsSnapshot();
  if (target.startsWith(`${source}${path.sep}`) || source.startsWith(`${target}${path.sep}`)) {
    throw new Error('新保存位置不能包含旧保存位置，或被旧保存位置包含');
  }
  fs.mkdirSync(target, { recursive: true });
  if (journalDataParts.some((part) => fs.existsSync(dataPartPath(target, part)))) {
    throw new Error('新保存位置中已存在一页的数据，请选择空文件夹');
  }

  const previousSettings = { ...appSettings };
  journalStore?.close();
  journalStore = undefined;
  try {
    copyJournalData(source, target);
    journalStore = createJournalStore({ dataDirectory: target });
    journalDataDirectory = target;
    appSettings = { ...appSettings, dataDirectory: target };
    saveAppSettings();
    deleteJournalData(source);
    return getSettingsSnapshot();
  } catch (error) {
    journalStore?.close();
    journalStore = createJournalStore({ dataDirectory: source });
    journalDataDirectory = source;
    appSettings = previousSettings;
    throw error;
  }
};

const exportJournalData = async () => {
  const defaultName = `一页备份-${new Date().toISOString().slice(0, 10)}.zip`;
  const result = await dialog.showSaveDialog({
    title: '导出一页数据',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const archive = new AdmZip();
  archive.addFile('manifest.json', Buffer.from(JSON.stringify({ format: 'one-page-backup', version: 1, exportedAt: new Date().toISOString() }, null, 2)));
  for (const part of journalDataParts) {
    const source = dataPartPath(journalDataDirectory, part);
    if (fs.existsSync(source)) archive.addLocalFolder(source, part);
  }
  archive.writeZip(result.filePath);
  return { canceled: false, filePath: result.filePath };
};

const importJournalData = async () => {
  const result = await dialog.showOpenDialog({
    title: '导入一页备份',
    properties: ['openFile'],
    filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };

  const temporaryDirectory = path.join(app.getPath('temp'), `one-page-import-${Date.now()}`);
  const rollbackDirectory = path.join(temporaryDirectory, 'rollback');
  try {
    const archive = new AdmZip(result.filePaths[0]);
    if (archive.getEntries().some((entry) => entry.entryName.includes('..'))) throw new Error('备份文件路径无效');
    const manifestEntry = archive.getEntry('manifest.json');
    if (!manifestEntry) throw new Error('不是有效的一页备份文件');
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    if (manifest.format !== 'one-page-backup' || manifest.version !== 1 || !archive.getEntry('journal/journal.db')) {
      throw new Error('不是有效的一页备份文件');
    }
    archive.extractAllTo(temporaryDirectory, true);
    fs.mkdirSync(rollbackDirectory, { recursive: true });
    journalStore?.close();
    journalStore = undefined;
    copyJournalData(journalDataDirectory, rollbackDirectory);
    deleteJournalData(journalDataDirectory);
    copyJournalData(temporaryDirectory, journalDataDirectory);
    journalStore = createJournalStore({ dataDirectory: journalDataDirectory });
    return { canceled: false };
  } catch (error) {
    journalStore?.close();
    if (fs.existsSync(rollbackDirectory)) {
      deleteJournalData(journalDataDirectory);
      copyJournalData(rollbackDirectory, journalDataDirectory);
    }
    journalStore = createJournalStore({ dataDirectory: journalDataDirectory });
    throw error;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

const resetJournalData = async () => {
  journalStore?.close();
  journalStore = undefined;
  try {
    deleteJournalData(journalDataDirectory);
    journalStore = createJournalStore({ dataDirectory: journalDataDirectory });
    await session.defaultSession.clearCache();
    await session.defaultSession.clearStorageData();
    return { reset: true };
  } catch (error) {
    journalStore?.close();
    journalStore = createJournalStore({ dataDirectory: journalDataDirectory });
    throw error;
  }
};

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
    settingsPath = path.join(app.getPath('userData'), 'settings.json');
    appSettings = readAppSettings();
    configureJournalStore(normalizedDirectory(appSettings.dataDirectory || app.getPath('userData')));
    protocol.handle('journal-media', (request) => {
      const mediaPath = journalStore.resolveMediaPath(request.url);
      return mediaPath ? net.fetch(pathToFileURL(mediaPath).toString()) : new Response('Not found', { status: 404 });
    });
  } catch (error) {
    journalStoreError = error instanceof Error ? error.message : String(error);
    console.error('Journal storage is unavailable:', error);
  }

  createWindow();
  configureUpdates();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle('journal:load', (_event, entryDate) => journalStore?.load(entryDate) ?? null);
ipcMain.handle('journal:list-month', (_event, year, month) => journalStore?.listMonth(year, month) ?? []);
ipcMain.handle('journal:list-timeline', (_event, options) => journalStore?.listTimeline(options) ?? { entries: [], nextCursor: null });
ipcMain.handle('journal:list-favorites', () => journalStore?.listFavorites() ?? []);
ipcMain.handle('journal:toggle-favorite', (_event, entryDate) => journalStore?.toggleFavorite(entryDate) ?? { updated: false, isFavorite: false });
ipcMain.handle('journal:get-review', (_event, today) => journalStore?.getReview(today) ?? { total: 0, monthCount: 0, previousYear: null, randomEntry: null });
ipcMain.handle('journal:save', (_event, entry) => journalStore?.save(entry) ?? { saved: false });
ipcMain.handle('journal:remove', (_event, entryDate) => journalStore?.remove(entryDate));
ipcMain.handle('journal:import-media', (_event, media) => journalStore?.importMedia(media));
ipcMain.handle('journal:status', () => ({
  available: Boolean(journalStore),
  error: journalStoreError,
}));
ipcMain.handle('settings:get', () => getSettingsSnapshot());
ipcMain.handle('settings:set-theme', (_event, theme) => {
  if (!['light', 'dark', 'system'].includes(theme)) throw new Error('Invalid theme');
  appSettings = { ...appSettings, theme };
  saveAppSettings();
  return getSettingsSnapshot();
});
ipcMain.handle('settings:choose-data-directory', async () => {
  const selection = await dialog.showOpenDialog({
    title: '选择一页数据保存位置',
    defaultPath: journalDataDirectory,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
  return { canceled: false, settings: migrateJournalData(selection.filePaths[0]) };
});
ipcMain.handle('settings:export-data', exportJournalData);
ipcMain.handle('settings:import-data', importJournalData);
ipcMain.handle('settings:reset-data', resetJournalData);
ipcMain.handle('security:status', () => ({ passwordSet: Boolean(appSettings.security?.salt && appSettings.security?.passwordHash) }));
ipcMain.handle('security:set-password', (_event, password) => {
  if (appSettings.security?.passwordHash) throw new Error('密码已设置，请使用修改密码功能');
  savePassword(password);
  return { passwordSet: true };
});
ipcMain.handle('security:verify-password', (_event, password) => ({ verified: passwordIsCorrect(password) }));
ipcMain.handle('security:change-password', (_event, currentPassword, newPassword) => {
  if (!passwordIsCorrect(currentPassword)) throw new Error('当前密码不正确');
  savePassword(newPassword);
  return { passwordSet: true };
});
ipcMain.handle('updates:check', async () => {
  if (!app.isPackaged) return { status: 'development' };
  if (!isSquirrelInstall()) return checkPortableUpdate({ showDialog: true });
  return checkInstalledUpdate();
});
ipcMain.handle('updates:download', downloadInstalledUpdate);
ipcMain.handle('updates:install', () => installDownloadedUpdate());
ipcMain.handle('updates:get-state', () => updateStateSnapshot());

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
