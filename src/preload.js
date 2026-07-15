import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChanged: (callback) => {
    const listener = (_, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', listener);

    return () => {
      ipcRenderer.removeListener('window:maximized-changed', listener);
    };
  },
});

contextBridge.exposeInMainWorld('journalStore', {
  status: () => ipcRenderer.invoke('journal:status'),
  load: (entryDate) => ipcRenderer.invoke('journal:load', entryDate),
  listMonth: (year, month) => ipcRenderer.invoke('journal:list-month', year, month),
  listTimeline: (options) => ipcRenderer.invoke('journal:list-timeline', options),
  listFavorites: () => ipcRenderer.invoke('journal:list-favorites'),
  toggleFavorite: (entryDate) => ipcRenderer.invoke('journal:toggle-favorite', entryDate),
  getReview: (today) => ipcRenderer.invoke('journal:get-review', today),
  save: (entry) => ipcRenderer.invoke('journal:save', entry),
  remove: (entryDate) => ipcRenderer.invoke('journal:remove', entryDate),
  importMedia: ({ entryDate, file }) => ipcRenderer.invoke('journal:import-media', {
    entryDate,
    fileName: file.name,
    mimeType: file.type,
    filePath: webUtils.getPathForFile(file),
  }),
});

contextBridge.exposeInMainWorld('appSettings', {
  get: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:set-theme', theme),
  chooseDataDirectory: () => ipcRenderer.invoke('settings:choose-data-directory'),
  exportData: () => ipcRenderer.invoke('settings:export-data'),
  importData: () => ipcRenderer.invoke('settings:import-data'),
  resetData: () => ipcRenderer.invoke('settings:reset-data'),
});

contextBridge.exposeInMainWorld('appSecurity', {
  status: () => ipcRenderer.invoke('security:status'),
  setPassword: (password) => ipcRenderer.invoke('security:set-password', password),
  verifyPassword: (password) => ipcRenderer.invoke('security:verify-password', password),
  changePassword: (currentPassword, newPassword) => ipcRenderer.invoke('security:change-password', currentPassword, newPassword),
});

contextBridge.exposeInMainWorld('appUpdates', {
  check: () => ipcRenderer.invoke('updates:check'),
  download: () => ipcRenderer.invoke('updates:download'),
  install: () => ipcRenderer.invoke('updates:install'),
  getState: () => ipcRenderer.invoke('updates:get-state'),
  onState: (callback) => {
    const listener = (_, state) => callback(state);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
});
