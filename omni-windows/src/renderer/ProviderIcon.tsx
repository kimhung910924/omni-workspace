import React from 'react';
import type { ProviderId } from './providerUrlStore';

const PROVIDER_ICON_URLS: Record<ProviderId, string> = {
  claude: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=64',
  chatgpt: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64',
  gemini: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64',
  grok: 'https://www.google.com/s2/favicons?domain=grok.com&sz=64',
  perplexity: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=64',
};

type ProviderIconProps = {
  providerId: ProviderId;
  label: string;
  className?: string;
};

export function ProviderIcon({ providerId, label, className = '' }: ProviderIconProps) {
  const [iconFailed, setIconFailed] = React.useState(false);

  return (
    <span className={`provider-logo ${providerId} ${iconFailed ? 'failed' : ''} ${className}`} aria-hidden="true">
      {!iconFailed && <img src={PROVIDER_ICON_URLS[providerId]} alt="" onError={() => setIconFailed(true)} />}
      <span className="provider-logo-fallback">{label[0]}</span>
    </span>
  );
}
