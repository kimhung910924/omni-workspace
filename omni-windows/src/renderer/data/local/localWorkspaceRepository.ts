import type { LayoutMode, Slot, WorkspaceRecord } from '../../types';
import type { ProviderId } from '../../providerUrlStore';
import type { WorkspaceRepository } from '../repositories';

const STORAGE_KEY = 'omni-workspaces';
const MAX_WORKSPACES = 8;

function normalizeSlot(value: unknown): Slot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const slot = value as Partial<Slot> & { providerId?: unknown; kind?: unknown };

  if (slot.kind === 'web') {
    if (typeof slot.id !== 'string' || typeof slot.currentUrl !== 'string' || typeof slot.title !== 'string') {
      return null;
    }

    return {
      id: slot.id,
      kind: 'web',
      currentUrl: slot.currentUrl,
      title: slot.title,
    };
  }

  if (
    typeof slot.id !== 'string' ||
    typeof slot.providerId !== 'string' ||
    typeof slot.currentUrl !== 'string' ||
    typeof slot.title !== 'string'
  ) {
    return null;
  }

  return {
    id: slot.id,
    kind: 'ai',
    providerId: slot.providerId as ProviderId,
    currentUrl: slot.currentUrl,
    title: slot.title,
  };
}

function normalizeWorkspaceRecord(value: unknown): WorkspaceRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const workspace = value as Partial<WorkspaceRecord>;

  if (
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    Array.isArray(workspace.slots) &&
    Array.isArray(workspace.stageIds) &&
    workspace.stageIds.every((id) => typeof id === 'string') &&
    Array.isArray(workspace.dockIds) &&
    workspace.dockIds.every((id) => typeof id === 'string') &&
    (workspace.layoutMode === 'row' || workspace.layoutMode === 'grid2x2') &&
    typeof workspace.dockMinimized === 'boolean' &&
    typeof workspace.createdAt === 'string' &&
    typeof workspace.updatedAt === 'string'
  ) {
    return {
      id: workspace.id,
      name: workspace.name,
      slots: workspace.slots.map(normalizeSlot).filter((slot): slot is Slot => slot !== null),
      stageIds: workspace.stageIds,
      dockIds: workspace.dockIds,
      layoutMode: workspace.layoutMode,
      dockMinimized: workspace.dockMinimized,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    };
  }

  return null;
}

function loadWorkspaceRecords(): WorkspaceRecord[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.map(normalizeWorkspaceRecord).filter((workspace): workspace is WorkspaceRecord => workspace !== null);
    }
  } catch {
    return [];
  }

  return [];
}

function saveWorkspaceRecords(workspaces: WorkspaceRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
}

export function listWorkspaces(): WorkspaceRecord[] {
  return loadWorkspaceRecords();
}

export function getWorkspace(id: string): WorkspaceRecord | null {
  return listWorkspaces().find((workspace) => workspace.id === id) ?? null;
}

export function canCreateWorkspace(): boolean {
  return listWorkspaces().length < MAX_WORKSPACES;
}

export function createWorkspace(
  name: string,
  group: {
    slots: Slot[];
    stageIds: string[];
    dockIds: string[];
    layoutMode: LayoutMode;
    dockMinimized: boolean;
  },
): WorkspaceRecord {
  const workspaces = listWorkspaces();

  if (workspaces.length >= MAX_WORKSPACES) {
    throw new Error('Maximum workspace count reached');
  }

  const now = new Date().toISOString();
  const workspace: WorkspaceRecord = {
    id: crypto.randomUUID(),
    name,
    slots: group.slots,
    stageIds: group.stageIds,
    dockIds: group.dockIds,
    layoutMode: group.layoutMode,
    dockMinimized: group.dockMinimized,
    createdAt: now,
    updatedAt: now,
  };

  saveWorkspaceRecords([...workspaces, workspace]);

  return workspace;
}

export function updateWorkspace(
  id: string,
  patch: Partial<
    Pick<WorkspaceRecord, 'slots' | 'stageIds' | 'dockIds' | 'layoutMode' | 'dockMinimized'>
  >,
): WorkspaceRecord | null {
  const workspaces = listWorkspaces();
  const workspaceIndex = workspaces.findIndex((workspace) => workspace.id === id);

  if (workspaceIndex === -1) {
    return null;
  }

  const updatedWorkspace: WorkspaceRecord = {
    ...workspaces[workspaceIndex],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const updatedWorkspaces = [...workspaces];
  updatedWorkspaces[workspaceIndex] = updatedWorkspace;

  saveWorkspaceRecords(updatedWorkspaces);

  return updatedWorkspace;
}

export function renameWorkspace(id: string, name: string): WorkspaceRecord | null {
  const workspaces = listWorkspaces();
  const workspaceIndex = workspaces.findIndex((workspace) => workspace.id === id);

  if (workspaceIndex === -1) {
    return null;
  }

  const updatedWorkspace: WorkspaceRecord = {
    ...workspaces[workspaceIndex],
    name,
    updatedAt: new Date().toISOString(),
  };
  const updatedWorkspaces = [...workspaces];
  updatedWorkspaces[workspaceIndex] = updatedWorkspace;

  saveWorkspaceRecords(updatedWorkspaces);

  return updatedWorkspace;
}

export function deleteWorkspace(id: string): void {
  const workspaces = listWorkspaces();
  const updatedWorkspaces = workspaces.filter((workspace) => workspace.id !== id);

  if (updatedWorkspaces.length === workspaces.length) {
    return;
  }

  saveWorkspaceRecords(updatedWorkspaces);
}

export const workspaceRepository: WorkspaceRepository = {
  list: listWorkspaces,
  get: getWorkspace,
  canCreate: canCreateWorkspace,
  create: createWorkspace,
  update: updateWorkspace,
  rename: renameWorkspace,
  remove: deleteWorkspace,
};
