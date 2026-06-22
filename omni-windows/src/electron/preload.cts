import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('omni', {
  claudePartition: 'persist:claude',
  chatgptPartition: 'persist:chatgpt',
});
