import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';

export const providerAdapters = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
};

export type { ProviderAdapter, ProviderWebview, SendResult } from './types';
