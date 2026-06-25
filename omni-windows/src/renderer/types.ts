import type { ProviderId } from './providerUrlStore';

export type Slot = {
  id: string;
  providerId: ProviderId;
  currentUrl: string;
  title: string;
};

export type LayoutMode = 'row' | 'grid2x2';

export type WorkspaceRecord = {
  id: string;
  name: string;
  slots: Slot[];
  stageIds: string[];
  dockIds: string[];
  layoutMode: LayoutMode;
  dockMinimized: boolean;
  createdAt: string;
  updatedAt: string;
};
