import type { LayoutMode, Slot } from './types';

export type Group = {
  id: string;
  slots: Slot[];
  stageIds: string[];
  dockIds: string[];
  layoutMode: LayoutMode;
  dockMinimized: boolean;
};

const STORAGE_KEY = 'omni-current-group';

function isValidSlot(value: unknown): value is Slot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const slot = value as Partial<Slot>;

  return (
    typeof slot.id === 'string' &&
    typeof slot.providerId === 'string' &&
    typeof slot.currentUrl === 'string' &&
    typeof slot.title === 'string'
  );
}

function isValidGroup(value: unknown): value is Group {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const group = value as Partial<Group>;

  return (
    typeof group.id === 'string' &&
    Array.isArray(group.slots) &&
    group.slots.every(isValidSlot) &&
    Array.isArray(group.stageIds) &&
    group.stageIds.every((id) => typeof id === 'string') &&
    Array.isArray(group.dockIds) &&
    group.dockIds.every((id) => typeof id === 'string') &&
    (group.layoutMode === 'row' || group.layoutMode === 'grid2x2') &&
    typeof group.dockMinimized === 'boolean'
  );
}

export function loadGroup(): Group | null {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (isValidGroup(parsedValue)) {
      return parsedValue;
    }
  } catch {
    return null;
  }

  return null;
}

export function saveGroup(group: Group): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(group));
}
