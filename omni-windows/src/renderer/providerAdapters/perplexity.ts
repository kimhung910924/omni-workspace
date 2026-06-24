import { executeDomSend } from './domSendScript';
import type { ProviderAdapter } from './types';

const PERPLEXITY_INPUT_SELECTORS = ['textarea', '[contenteditable="true"]'];

const PERPLEXITY_SEND_BUTTON_SELECTORS = ['button[aria-label*="Submit"]', 'button[type="submit"]'];

export const perplexityAdapter: ProviderAdapter = {
  providerId: 'perplexity',
  label: 'Perplexity',
  startUrl: 'https://www.perplexity.ai',
  newChatUrl: 'https://www.perplexity.ai',
  sendMessage(webview, text) {
    return executeDomSend(
      webview,
      {
        providerId: 'perplexity',
        label: 'Perplexity',
        inputSelectors: PERPLEXITY_INPUT_SELECTORS,
        sendButtonSelectors: PERPLEXITY_SEND_BUTTON_SELECTORS,
      },
      text,
    );
  },
};
