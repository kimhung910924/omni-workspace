import type { ProviderId } from '../providerUrlStore';
import type { ProviderWebview, SendResult } from './types';

type DomSendConfig = {
  providerId: ProviderId;
  label: string;
  inputSelectors: string[];
  sendButtonSelectors: string[];
};

type DomSendResult = {
  ok: boolean;
  message: string;
  needsNativeEnter?: boolean;
};

function createDomSendScript(config: DomSendConfig, text: string): string {
  return `
    (async () => {
      const providerLabel = ${JSON.stringify(config.label)};
      const text = ${JSON.stringify(text)};
      const inputSelectors = ${JSON.stringify(config.inputSelectors)};
      const sendButtonSelectors = ${JSON.stringify(config.sendButtonSelectors)};
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const isVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };

      const findFirstVisible = (selectors) => {
        for (const selector of selectors) {
          const matches = Array.from(document.querySelectorAll(selector));
          const visible = matches.find(isVisible);
          if (visible) return visible;
        }

        return null;
      };

      const isEnabledButton = (element) =>
        element instanceof HTMLElement &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true' &&
        !element.closest('[aria-disabled="true"]');

      const findReadySendButton = () => {
        const selectorButton = findFirstVisible(sendButtonSelectors);
        return isEnabledButton(selectorButton) ? selectorButton : null;
      };

      const waitForReadySendButton = async () => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const button = findReadySendButton();
          if (button) return button;
          await sleep(100);
        }

        return null;
      };

      const dispatchInput = (element) => {
        element.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertReplacementText',
          data: null,
        }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      };

      const setTextValue = (element) => {
        element.focus();

        if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
          const valueSetter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
          valueSetter?.call(element, text);
          dispatchInput(element);
          return element.value === text;
        }

        if (element.isContentEditable) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection?.removeAllRanges();
          selection?.addRange(range);
          document.execCommand('insertText', false, text);

          if (!element.textContent?.includes(text)) {
            element.textContent = text;
          }

          dispatchInput(element);
          return Boolean(element.textContent?.includes(text));
        }

        return false;
      };

      try {
        const input = findFirstVisible(inputSelectors);

        if (!input) {
          console.warn('[Omni broadcast]', providerLabel, 'input not found');
          return { ok: false, message: 'input not found' };
        }

        if (!setTextValue(input)) {
          console.warn('[Omni broadcast]', providerLabel, 'failed to update input');
          return { ok: false, message: 'failed to update input' };
        }

        await sleep(80);

        const sendButton = await waitForReadySendButton();
        if (sendButton instanceof HTMLElement) {
          sendButton.click();
          return { ok: true, message: 'sent' };
        }

        return { ok: false, message: 'send button not found', needsNativeEnter: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Omni broadcast]', providerLabel, message);
        return { ok: false, message };
      }
    })();
  `;
}

export async function executeDomSend(
  webview: ProviderWebview,
  config: DomSendConfig,
  text: string,
): Promise<SendResult> {
  if (typeof webview.executeJavaScript !== 'function') {
    console.warn('[Omni broadcast]', config.label, 'webview executeJavaScript unavailable');
    return {
      ok: false,
      providerId: config.providerId,
      message: 'webview unavailable',
    };
  }

  if (webview.isLoading?.()) {
    console.warn('[Omni broadcast]', config.label, 'webview is still loading');
    return {
      ok: false,
      providerId: config.providerId,
      message: 'webview loading',
    };
  }

  try {
    const result = await webview.executeJavaScript<DomSendResult>(createDomSendScript(config, text), true);

    if (result.needsNativeEnter && typeof webview.sendInputEvent === 'function') {
      webview.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      webview.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });

      return {
        ok: true,
        providerId: config.providerId,
        message: 'sent with native enter fallback',
      };
    }

    return {
      ok: result.ok,
      providerId: config.providerId,
      message: result.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Omni broadcast]', config.label, message);

    return {
      ok: false,
      providerId: config.providerId,
      message,
    };
  }
}
