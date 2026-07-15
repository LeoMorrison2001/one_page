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
  save: (entry) => ipcRenderer.invoke('journal:save', entry),
  remove: (entryDate) => ipcRenderer.invoke('journal:remove', entryDate),
  importMedia: ({ entryDate, file }) => ipcRenderer.invoke('journal:import-media', {
    entryDate,
    fileName: file.name,
    mimeType: file.type,
    filePath: webUtils.getPathForFile(file),
  }),
});
