import type { ProviderId } from '../../providerUrlStore';
import type { PersistedMeta } from '../../data/persistedMeta';

export type MemoProvider = ProviderId;

export type Memo = {
  id: string;
  title: string;
  content: string;
  provider: MemoProvider | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
} & PersistedMeta;

export type MemoDraft = {
  title?: string;
  content: string;
  provider: MemoProvider | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
};
