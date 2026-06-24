import type { ProviderId } from '../providerUrlStore';

export type ProviderWebview = HTMLElement & {
  executeJavaScript?: <T = unknown>(code: string, userGesture?: boolean) => Promise<T>;
  loadURL?: (url: string) => void;
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  goBack?: () => void;
  goForward?: () => void;
  isLoading?: () => boolean;
  reload?: () => void;
  sendInputEvent?: (event: { type: 'keyDown' | 'keyUp'; keyCode: string }) => void;
};

export type SendResult = {
  ok: boolean;
  providerId: ProviderId;
  message: string;
};

export type ProviderAdapter = {
  providerId: ProviderId;
  label: string;
  startUrl: string;
  newChatUrl: string;
  sendMessage: (webview: ProviderWebview, text: string) => Promise<SendResult>;
};
