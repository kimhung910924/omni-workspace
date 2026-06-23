import type { Memo, MemoDraft } from './types';

const STORAGE_KEY = 'omni-memos';

function isMemo(value: unknown): value is Memo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const memo = value as Partial<Memo>;

  return (
    typeof memo.id === 'string' &&
    typeof memo.title === 'string' &&
    typeof memo.content === 'string' &&
    (memo.provider === 'claude' || memo.provider === 'chatgpt' || memo.provider === null) &&
    (typeof memo.sourceUrl === 'string' || memo.sourceUrl === null) &&
    (typeof memo.sourceTitle === 'string' || memo.sourceTitle === null) &&
    typeof memo.pinned === 'boolean' &&
    typeof memo.createdAt === 'number' &&
    typeof memo.updatedAt === 'number'
  );
}

export function loadMemos(): Memo[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isMemo);
    }
  } catch {
    return [];
  }

  return [];
}

export function saveMemos(memos: Memo[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
}

export function createMemo(draft: MemoDraft): Memo {
  const now = Date.now();
  const content = draft.content.trim();
  const fallbackTitle = content.split(/\r?\n/).find(Boolean)?.slice(0, 64) ?? 'Untitled memo';

  return {
    id: crypto.randomUUID(),
    title: (draft.title ?? draft.sourceTitle ?? fallbackTitle).trim().slice(0, 120) || fallbackTitle,
    content,
    provider: draft.provider,
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}
