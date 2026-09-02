import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { createStarterDocument } from '@jackharrhy/worldview-editor/core';
import { FileBlobStore } from '../src/blob-store.js';
import { RemoteBuildQueue } from '../src/build-queue.js';
import { WorldviewDatabase, type WorldviewUser } from '../src/database.js';
import type { HostedMapCheckpoint, HostedMapSnapshot } from '../src/map-cell-client.js';
import { createWorldviewService } from '../src/server.js';

export const TEST_REALTIME_TICKET_SECRET = 'test-worldview-realtime-ticket-secret-0001';

export class FakeMapCells {
  readonly snapshots = new Map<string, HostedMapSnapshot>();
  readonly checkpoints: { mapId: string; name: string }[] = [];

  async initialize(mapId: string, source: string): Promise<HostedMapSnapshot> {
    const snapshot = {
      mapId,
      mapVersion: 0,
      document: createStarterDocument(),
      source,
      sourceSha256: 'a'.repeat(64),
    };
    this.snapshots.set(mapId, snapshot);
    return snapshot;
  }

  async snapshot(mapId: string): Promise<HostedMapSnapshot> {
    const snapshot = this.snapshots.get(mapId);
    if (!snapshot) throw new Error('MapCell is not initialized');
    return snapshot;
  }

  async createCheckpoint(
    mapId: string,
    name: string,
    actorId: string,
  ): Promise<HostedMapCheckpoint> {
    this.checkpoints.push({ mapId, name });
    const snapshot = await this.snapshot(mapId);
    return {
      id: 'checkpoint-1',
      name,
      mapVersion: snapshot.mapVersion,
      sourceSha256: snapshot.sourceSha256,
      createdBy: actorId,
      createdAt: Date.now(),
    };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

export async function fixture(fetchImpl?: typeof fetch, compilerFetch?: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), 'worldview-service-test-'));
  const database = new WorldviewDatabase(join(root, 'worldview.db'));
  const maps = new FakeMapCells();
  const blobs = new FileBlobStore(join(root, 'blobs'));
  const options = {
    database,
    blobs,
    oauth: {
      fourmUrl: 'https://4orm.example',
      clientId: 'worldview',
      publicUrl: 'http://127.0.0.1',
    },
    realtimeTicketSecret: TEST_REALTIME_TICKET_SECRET,
    maps,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    ...(compilerFetch
      ? {
          builds: new RemoteBuildQueue(
            database,
            blobs,
            { quake: 'http://compiler.internal' },
            compilerFetch,
          ),
        }
      : {}),
  };
  const server = createWorldviewService(options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server has no address');
  const origin = `http://127.0.0.1:${address.port}`;
  cleanups.push(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
    await rm(root, { recursive: true, force: true });
  });
  return { origin, root, database, maps, blobs, options };
}

export function session(
  database: WorldviewDatabase,
  profile: Omit<WorldviewUser, 'id'> = {
    fourmSub: 'fourm-1',
    username: 'mapper',
    displayName: 'Mapper',
    isAdmin: false,
  },
) {
  const user = database.upsertUser(profile);
  return { user, cookie: `worldview_session=${database.createSession(user.id).token}` };
}
