import type { LayoutMode, Slot, WorkspaceRecord } from '../types';
import type { Memo } from '../features/memos/types';

export interface WorkspaceRepository {
  list(): WorkspaceRecord[];
  get(id: string): WorkspaceRecord | null;
  canCreate(): boolean;
  create(
    name: string,
    group: {
      slots: Slot[];
      stageIds: string[];
      dockIds: string[];
      layoutMode: LayoutMode;
      dockMinimized: boolean;
    },
  ): WorkspaceRecord;
  update(
    id: string,
    patch: Partial<Pick<WorkspaceRecord, 'slots' | 'stageIds' | 'dockIds' | 'layoutMode' | 'dockMinimized'>>,
  ): WorkspaceRecord | null;
  rename(id: string, name: string): WorkspaceRecord | null;
  remove(id: string): void;
}

export interface MemoRepository {
  list(): Memo[];
  save(memos: Memo[]): void;
}
