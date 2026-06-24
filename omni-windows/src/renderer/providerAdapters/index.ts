import { chatgptAdapter } from './chatgpt';
import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { grokAdapter } from './grok';
import { perplexityAdapter } from './perplexity';

export const providerAdapters = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  gemini: geminiAdapter,
  grok: grokAdapter,
  perplexity: perplexityAdapter,
};

export type { ProviderAdapter, ProviderWebview, SendResult } from './types';
