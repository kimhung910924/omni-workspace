import { contextBridge } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

contextBridge.exposeInMainWorld('omni', {
  claudePartition: 'persist:claude',
  chatgptPartition: 'persist:chatgpt',
  webviewCapturePreloadUrl: pathToFileURL(path.join(__dirname, 'webviewCapture.cjs')).toString(),
});
