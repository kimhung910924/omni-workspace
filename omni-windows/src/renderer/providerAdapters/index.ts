import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';

export const providerAdapters = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  gemini: geminiAdapter,
};

export type { ProviderAdapter, ProviderWebview, SendResult } from './types';
