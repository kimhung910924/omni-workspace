export type SyncState = 'local-only' | 'synced' | 'dirty' | 'deleted';

export type PersistedMeta = {
  schemaVersion?: number;
  deletedAt?: string | null;
  syncState?: SyncState;
  lastSyncedAt?: string | null;
};
