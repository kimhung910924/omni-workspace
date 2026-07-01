import type { Favorite, FavoriteFolder } from './types';

export function createFavorite(url: string, title: string, folderId: string | null): Favorite {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    url,
    title,
    folderId,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFavoriteFolder(name: string): FavoriteFolder {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
  };
}
