import type { Memo, MemoDraft } from './types';

export function createMemo(draft: MemoDraft): Memo {
  const now = Date.now();
  const content = draft.content.trim();
  const fallbackTitle = content.split(/\r?\n/).find(Boolean)?.slice(0, 64) ?? 'Untitled memo';
  const title =
    draft.title === undefined ? (draft.sourceTitle ?? fallbackTitle).trim().slice(0, 120) || fallbackTitle : draft.title.trim().slice(0, 120);

  return {
    id: crypto.randomUUID(),
    title,
    content,
    provider: draft.provider,
    sourceUrl: draft.sourceUrl,
    sourceTitle: draft.sourceTitle,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}
