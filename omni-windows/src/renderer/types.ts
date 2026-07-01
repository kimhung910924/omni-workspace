import type { ProviderId } from './providerUrlStore';
import type { PersistedMeta } from './data/persistedMeta';

export type ProviderSlot = {
  id: string;
  kind: 'ai';
  providerId: ProviderId;
  currentUrl: string;
  title: string;
};

export type WebSlot = {
  id: string;
  kind: 'web';
  currentUrl: string;
  title: string;
};

export type Slot = ProviderSlot | WebSlot;

export function isAiSlot(slot: Slot): slot is ProviderSlot {
  return slot.kind === 'ai';
}

export type LayoutMode = 'row' | 'grid2x2';

export type Group = {
  id: string;
  slots: Slot[];
  stageIds: string[];
  dockIds: string[];
  layoutMode: LayoutMode;
  dockMinimized: boolean;
};

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
} & PersistedMeta;
