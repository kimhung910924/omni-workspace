import { executeDomSend } from './domSendScript';
import type { ProviderAdapter } from './types';

export const chatgptAdapter: ProviderAdapter = {
  providerId: 'chatgpt',
  label: 'ChatGPT',
  newChatUrl: 'https://chatgpt.com/',
  sendMessage(webview, text) {
    return executeDomSend(
      webview,
      {
        providerId: 'chatgpt',
        label: 'ChatGPT',
        inputSelectors: [
          '#prompt-textarea',
          '[contenteditable="true"][id="prompt-textarea"]',
          '[contenteditable="true"][data-placeholder]',
          '[contenteditable="true"][role="textbox"]',
          'textarea',
          'div[contenteditable="true"]',
        ],
        sendButtonSelectors: [
          '[data-testid="send-button"]',
          'button[aria-label*="Send"]',
          'button[aria-label*="send"]',
          'button[type="submit"]',
        ],
      },
      text,
    );
  },
};
