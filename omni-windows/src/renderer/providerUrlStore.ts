export type ProviderId = 'claude' | 'chatgpt' | 'gemini' | 'grok' | 'perplexity';

export type ProviderUrlConfig = {
  id: ProviderId;
  defaultUrl: string;
};

const STORAGE_KEY_PREFIX = 'omni.providerUrl';

function getStorageKey(providerId: ProviderId): string {
  return `${STORAGE_KEY_PREFIX}.${providerId}`;
}

export function isRestorableUrl(providerId: ProviderId, value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      ((providerId === 'claude' && url.hostname === 'claude.ai') ||
        (providerId === 'chatgpt' && url.hostname === 'chatgpt.com') ||
        (providerId === 'gemini' && url.hostname === 'gemini.google.com') ||
        (providerId === 'grok' && url.hostname === 'grok.com') ||
        (providerId === 'perplexity' && url.hostname === 'www.perplexity.ai'))
    );
  } catch {
    return false;
  }
}

export function getInitialProviderUrl(config: ProviderUrlConfig): string {
  const storedUrl = window.localStorage.getItem(getStorageKey(config.id));

  if (storedUrl && isRestorableUrl(config.id, storedUrl)) {
    return storedUrl;
  }

  return config.defaultUrl;
}

export function saveProviderUrl(providerId: ProviderId, url: string): void {
  if (!isRestorableUrl(providerId, url)) {
    return;
  }

  window.localStorage.setItem(getStorageKey(providerId), url);
}
