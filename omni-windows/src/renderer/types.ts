import type { ProviderId } from './providerUrlStore';

export type Slot = {
  id: string;
  providerId: ProviderId;
  currentUrl: string;
  title: string;
};

export type LayoutMode = 'row' | 'grid2x2';
