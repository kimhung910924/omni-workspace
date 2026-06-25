import type { LayoutMode, Slot, WorkspaceRecord } from './types';

const STORAGE_KEY = 'omni-workspaces';
const MAX_WORKSPACES = 8;

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

function isValidWorkspaceRecord(value: unknown): value is WorkspaceRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const workspace = value as Partial<WorkspaceRecord>;

  return (
    typeof workspace.id === 'string' &&
    typeof workspace.name === 'string' &&
    Array.isArray(workspace.slots) &&
    workspace.slots.every(isValidSlot) &&
    Array.isArray(workspace.stageIds) &&
    workspace.stageIds.every((id) => typeof id === 'string') &&
    Array.isArray(workspace.dockIds) &&
    workspace.dockIds.every((id) => typeof id === 'string') &&
    (workspace.layoutMode === 'row' || workspace.layoutMode === 'grid2x2') &&
    typeof workspace.dockMinimized === 'boolean' &&
    typeof workspace.createdAt === 'string' &&
    typeof workspace.updatedAt === 'string'
  );
}

function loadWorkspaceRecords(): WorkspaceRecord[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (Array.isArray(parsedValue)) {
      return parsedValue.filter(isValidWorkspaceRecord);
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
