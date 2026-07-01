import type { Favorite, FavoriteFolder } from '../../features/favorites/types';
import type { FavoriteRepository } from '../repositories';

const STORAGE_KEY_FAVORITES = 'omni-favorites';
const STORAGE_KEY_FOLDERS = 'omni-favorite-folders';

function isFavorite(value: unknown): value is Favorite {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const favorite = value as Partial<Favorite>;

  return (
    typeof favorite.id === 'string' &&
    typeof favorite.url === 'string' &&
    typeof favorite.title === 'string' &&
    (typeof favorite.folderId === 'string' || favorite.folderId === null) &&
    typeof favorite.createdAt === 'number' &&
    typeof favorite.updatedAt === 'number'
  );
}

function isFavoriteFolder(value: unknown): value is FavoriteFolder {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const folder = value as Partial<FavoriteFolder>;

  return typeof folder.id === 'string' && typeof folder.name === 'string' && typeof folder.createdAt === 'number';
}

export function loadFavorites(): Favorite[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY_FAVORITES);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isFavorite);
    }
  } catch {
    return [];
  }

  return [];
}

export function saveFavorites(favorites: Favorite[]): void {
  window.localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(favorites));
}

export function loadFavoriteFolders(): FavoriteFolder[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY_FOLDERS);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isFavoriteFolder);
    }
  } catch {
    return [];
  }

  return [];
}

export function saveFavoriteFolders(folders: FavoriteFolder[]): void {
  window.localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders));
}

export const favoriteRepository: FavoriteRepository = {
  list: loadFavorites,
  save: saveFavorites,
  listFolders: loadFavoriteFolders,
  saveFolders: saveFavoriteFolders,
};
