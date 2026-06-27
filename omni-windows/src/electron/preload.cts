import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('omni', {
  claudePartition: 'persist:claude',
  chatgptPartition: 'persist:chatgpt',
  geminiPartition: 'persist:gemini',
  grokPartition: 'persist:grok',
  perplexityPartition: 'persist:perplexity',
  getWebviewCapturePreloadUrl: () => ipcRenderer.invoke('omni:get-webview-capture-preload-url'),
  getAppLocale: () => ipcRenderer.invoke('omni:get-app-locale'),
});
