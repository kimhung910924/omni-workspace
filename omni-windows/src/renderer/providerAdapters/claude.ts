import { executeDomSend } from './domSendScript';
import type { ProviderAdapter } from './types';

export const claudeAdapter: ProviderAdapter = {
  providerId: 'claude',
  label: 'Claude',
  startUrl: 'https://claude.ai',
  newChatUrl: 'https://claude.ai/new',
  sendMessage(webview, text) {
    return executeDomSend(
      webview,
      {
        providerId: 'claude',
        label: 'Claude',
        inputSelectors: [
          '[contenteditable="true"][role="textbox"]',
          'div[contenteditable="true"][data-placeholder]',
          'div[contenteditable="true"]',
          'textarea',
        ],
        sendButtonSelectors: [
          'button[aria-label*="Send"]',
          'button[aria-label*="send"]',
          'button[type="submit"]',
          '[data-testid*="send"]',
        ],
      },
      text,
    );
  },
};
