import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronApp', {
  platform:           process.platform,
  isDesktop:          true,
  completeOnboarding: (serverUrl) => ipcRenderer.send('onboarding-complete', serverUrl),
});
