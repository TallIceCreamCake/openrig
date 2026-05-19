const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  platform:           process.platform,
  isDesktop:          true,
  electronVersion:    process.versions.electron,
  nodeVersion:        process.versions.node,
  chromeVersion:      process.versions.chrome,
  v8Version:          process.versions.v8,
  completeOnboarding: (serverUrl) => ipcRenderer.send('onboarding-complete', serverUrl),
  openSettings:       ()          => ipcRenderer.send('open-settings'),
  getAppVersion:      ()          => ipcRenderer.invoke('get-app-version'),
  getServerUrl:       ()          => ipcRenderer.invoke('get-server-url'),
  saveServerUrl:      (url)       => ipcRenderer.send('save-server-url', url),
});
