import type { ProviderId } from '../../providerUrlStore';
import { PROVIDER_LABELS } from '../../providerLabels';
import type { Memo } from './types';

export function formatMemoDate(value: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function getMemoProviderLabel(memo: Memo): string {
  return memo.provider ? PROVIDER_LABELS[memo.provider] : 'Private';
}

export function getMemoDisplayTitle(memo: Memo): string {
  const title = memo.title.trim();

  if (title) {
    return title;
  }

  const contentTitle = memo.content.split(/\r?\n/).find(Boolean)?.trim().slice(0, 40);
  return contentTitle || '새 메모';
}

export function isNavigableProvider(provider: Memo['provider']): provider is ProviderId {
  return provider === 'claude' || provider === 'chatgpt';
}

export function getSourceHint(memo: Memo): string {
  if (memo.sourceTitle) {
    return memo.sourceTitle;
  }

  if (!memo.sourceUrl) {
    return '';
  }

  try {
    const url = new URL(memo.sourceUrl);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return memo.sourceUrl;
  }
}
