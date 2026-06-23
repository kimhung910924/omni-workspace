import type { ProviderAdapter } from './types';

export const geminiAdapter: ProviderAdapter = {
  providerId: 'gemini',
  label: 'Gemini',
  startUrl: 'https://gemini.google.com',
  newChatUrl: 'https://gemini.google.com/app',
  async sendMessage() {
    return {
      ok: false,
      providerId: 'gemini',
      message: 'Gemini broadcast is not enabled yet',
    };
  },
};
