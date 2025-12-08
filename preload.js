const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emu', {
  startServer: () => ipcRenderer.invoke('server:start'),
  stopServer: () => ipcRenderer.invoke('server:stop'),

  onLogLine: (callback) => {
    ipcRenderer.on('log-line', (_event, line) => {
      callback(line);
    });
  },

  sendSettings: (settings) => {
    ipcRenderer.send('settings:changed', settings);
  },

  onInitSettings: (callback) => {
    ipcRenderer.on('settings:init', (_event, settings) => {
      callback(settings);
    });
  },
});
