import { executeDomSend } from './domSendScript';
import type { ProviderAdapter } from './types';

// Gemini uses a rich text editor in current builds. Keep Gemini-only selectors
// here so the shared broadcast flow stays provider-agnostic.
const GEMINI_INPUT_SELECTORS = [
  'rich-textarea [contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
  'div[role="textbox"][contenteditable="true"]',
  '[contenteditable="true"][aria-label*="Enter"]',
  '[contenteditable="true"][aria-label*="prompt"]',
  '[contenteditable="true"][data-placeholder]',
  'div[contenteditable="true"]',
  'textarea',
];

const GEMINI_SEND_BUTTON_SELECTORS = [
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[aria-label*="전송"]',
  'button[aria-label*="Submit"]',
  'button[type="submit"]',
  '[data-testid*="send"]',
];

export const geminiAdapter: ProviderAdapter = {
  providerId: 'gemini',
  label: 'Gemini',
  startUrl: 'https://gemini.google.com',
  newChatUrl: 'https://gemini.google.com/app',
  sendMessage(webview, text) {
    return executeDomSend(
      webview,
      {
        providerId: 'gemini',
        label: 'Gemini',
        inputSelectors: GEMINI_INPUT_SELECTORS,
        sendButtonSelectors: GEMINI_SEND_BUTTON_SELECTORS,
      },
      text,
    );
  },
};
