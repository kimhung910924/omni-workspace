import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('omni', {
  claudePartition: 'persist:claude',
  chatgptPartition: 'persist:chatgpt',
  geminiPartition: 'persist:gemini',
  getWebviewCapturePreloadUrl: () => ipcRenderer.invoke('omni:get-webview-capture-preload-url'),
});
