import type { ProviderId } from '../../providerUrlStore';

export type Memo = {
  id: string;
  title: string;
  content: string;
  provider: ProviderId | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MemoDraft = {
  title?: string;
  content: string;
  provider: ProviderId | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
};
