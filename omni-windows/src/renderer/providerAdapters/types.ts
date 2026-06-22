import type { ProviderId } from '../providerUrlStore';

export type ProviderWebview = HTMLElement & {
  executeJavaScript?: <T = unknown>(code: string, userGesture?: boolean) => Promise<T>;
  isLoading?: () => boolean;
};

export type SendResult = {
  ok: boolean;
  providerId: ProviderId;
  message: string;
};

export type ProviderAdapter = {
  providerId: ProviderId;
  label: string;
  sendMessage: (webview: ProviderWebview, text: string) => Promise<SendResult>;
};
