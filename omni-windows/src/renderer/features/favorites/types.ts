import type { PersistedMeta } from '../../data/persistedMeta';

export type FavoriteFolder = {
  id: string;
  name: string;
  createdAt: number;
} & PersistedMeta;

export type Favorite = {
  id: string;
  url: string;
  title: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
} & PersistedMeta;
