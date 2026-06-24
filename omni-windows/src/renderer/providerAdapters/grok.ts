import { executeDomSend } from './domSendScript';
import type { ProviderAdapter } from './types';

const GROK_INPUT_SELECTORS = ['textarea', '[contenteditable="true"]'];

const GROK_SEND_BUTTON_SELECTORS = ['button[aria-label*="Send"]', 'button[type="submit"]'];

export const grokAdapter: ProviderAdapter = {
  providerId: 'grok',
  label: 'Grok',
  startUrl: 'https://grok.com',
  newChatUrl: 'https://grok.com',
  sendMessage(webview, text) {
    return executeDomSend(
      webview,
      {
        providerId: 'grok',
        label: 'Grok',
        inputSelectors: GROK_INPUT_SELECTORS,
        sendButtonSelectors: GROK_SEND_BUTTON_SELECTORS,
      },
      text,
    );
  },
};
