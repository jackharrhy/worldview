import type { HostedCheckpoint, HostedMapSnapshot } from '@worldview/protocol';

import type { ArtbinClient } from './artbin.js';
import type { BlobStore } from './blob-store.js';
import type { RemoteBuildQueue } from './build-queue.js';
import type { WorldviewDatabase } from './database.js';
import type { OAuthConfig } from './oauth.js';

export interface HostedMapStore {
  initialize(mapId: string, source: string): Promise<HostedMapSnapshot>;
  snapshot(mapId: string): Promise<HostedMapSnapshot>;
  createCheckpoint(mapId: string, name: string, actorId: string): Promise<HostedCheckpoint>;
}

export interface WorldviewServiceOptions {
  readonly database: WorldviewDatabase;
  readonly blobs: BlobStore;
  readonly oauth: OAuthConfig;
  readonly staticRoot?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly realtimeTicketSecret: string;
  readonly maps: HostedMapStore;
  readonly artbin?: ArtbinClient;
  readonly builds?: RemoteBuildQueue;
}
