import { env } from 'cloudflare:workers';
import { createHmac } from 'node:crypto';
import { evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  collaborationEditsBetween,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  insertBrush,
  serializeMap,
  translateBrush,
  type CollaborationOperation,
  type MapDocument,
} from '@jackharrhy/worldview-editor/core';
import type { MapCell } from '../src/map-cell.js';
import { parseClientFrame } from '../src/protocol.js';

function hostedTicket(mapId: string, role: 'owner' | 'editor' | 'viewer' = 'editor') {
  const header = Buffer.from(JSON.stringify({ algorithm: 'HS256', type: 'WVT' })).toString(
    'base64url',
  );
  const content = Buffer.from(
    JSON.stringify({
      version: 2,
      mapId,
      principalId: 'user-1',
      actorId: 'user-1',
      role,
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', env.WORLDVIEW_REALTIME_TICKET_SECRET)
    .update(`${header}.${content}`)
    .digest('base64url');
  return `${header}.${content}.${signature}`;
}

function operation(
  before: ReturnType<typeof createStarterDocument>,
  after: ReturnType<typeof createStarterDocument>,
): CollaborationOperation {
  return {
    schemaVersion: 1,
    operationId: 'alice:1',
    transactionId: 'alice:1',
    actorId: 'alice',
    baseMapVersion: 0,
    label: 'Edit map',
    edits: collaborationEditsBetween(before, after),
  };
}

describe('MapCell', () => {
  it('rejects malformed and oversized operation frames before state access', () => {
    expect(() =>
      parseClientFrame(
        JSON.stringify({
          type: 'operation',
          operation: {
            schemaVersion: 1,
            operationId: 'bad',
            transactionId: 'bad',
            actorId: 'mallory',
            baseMapVersion: 0,
            label: 'Malformed',
            edits: [{ kind: 'replace-brush', brushId: 'brush', baseRevision: 0 }],
          },
        }),
      ),
    ).toThrow('Invalid collaboration operation');
    expect(() => parseClientFrame('x'.repeat(512 * 1024 + 1))).toThrow(
      'Collaboration frame is too large',
    );
  });

  it('accepts bounded gesture presence and rejects malformed pointers', () => {
    expect(
      parseClientFrame(
        JSON.stringify({
          type: 'presence',
          presence: {
            actorId: 'alice',
            viewport: 'xy',
            pointer: [32, 64, 0],
            sentAt: 1,
            preview: {
              interactionId: 'drag-1',
              sequence: 4,
              baseMapVersion: 2,
              edits: [{ kind: 'delete-brush', brushId: 'brush', baseRevision: 0 }],
            },
          },
        }),
      ).type,
    ).toBe('presence');
    expect(() =>
      parseClientFrame(
        JSON.stringify({
          type: 'presence',
          presence: { actorId: 'alice', pointer: [0, 'bad', 0], sentAt: 1 },
        }),
      ),
    ).toThrow('Invalid presence payload');
  });

  it('requires signed map access and initializes one canonical snapshot', async () => {
    const mapId = 'map-auth';
    const preflight = await SELF.fetch(`https://map.test/sync/maps/${mapId}/initialize`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://editor.test' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect((await SELF.fetch(`https://map.test/sync/maps/${mapId}/snapshot`)).status).toBe(401);
    const source = serializeMap(createStarterDocument());
    expect(
      (
        await SELF.fetch(`https://map.test/sync/maps/${mapId}/initialize`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${hostedTicket('another-map')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await SELF.fetch(`https://map.test/sync/maps/${mapId}/initialize`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${hostedTicket(mapId, 'viewer')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source }),
        })
      ).status,
    ).toBe(403);
    const initialized = await SELF.fetch(`https://map.test/sync/maps/${mapId}/initialize`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${hostedTicket(mapId)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source }),
    });
    expect(initialized.status).toBe(200);
    expect(await initialized.json()).toMatchObject({ mapId, mapVersion: 0, source });
    const snapshot = await SELF.fetch(`https://map.test/sync/maps/${mapId}/snapshot`, {
      headers: { Authorization: `Bearer ${hostedTicket(mapId)}` },
    });
    expect(await snapshot.json()).toMatchObject({ mapId, mapVersion: 0, source });
  });

  it('atomically advances document, source, hash, receipt, and version', async () => {
    const mapId = 'atomic';
    const cell = env.MAP_CELLS.getByName(mapId);
    const initial = createStarterDocument();
    await cell.initialize(mapId, serializeMap(initial));
    const starter = (await cell.snapshot(mapId)).document as unknown as MapDocument;
    const ids = createSequentialIdFactory('atomic');
    const after = insertBrush(
      starter,
      starter.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids),
    );
    const edit = operation(starter, after);
    expect(await cell.submit('alice', edit)).toMatchObject({
      type: 'ack',
      operationId: edit.operationId,
      mapVersion: 1,
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const snapshot = await cell.snapshot(mapId);
    expect(snapshot.mapVersion).toBe(1);
    expect(snapshot.document.entities[0]!.primitives).toHaveLength(
      after.entities[0]!.primitives.length,
    );
    expect(snapshot.source).toContain('STONE');
    const originalAck = await cell.submit('alice', edit);
    expect(originalAck).toMatchObject({ type: 'ack', mapVersion: 1 });
    if (originalAck.type !== 'ack') throw new Error('Expected an acknowledgement');
    const secondDocument = insertBrush(
      after,
      after.entities[0]!.id,
      createBoxBrush([128, 0, 0], [192, 64, 64], 'METAL', ids),
    );
    const secondEdit = {
      ...operation(after, secondDocument),
      operationId: 'alice:2',
      transactionId: 'alice:2',
      baseMapVersion: 1,
    };
    expect(await cell.submit('alice', secondEdit)).toMatchObject({ type: 'ack', mapVersion: 2 });
    expect(await cell.submit('alice', edit)).toEqual(originalAck);
    await runInDurableObject(cell, (_instance: MapCell, state) => {
      expect(state.storage.sql.exec('SELECT * FROM operation_receipts').toArray()).toHaveLength(2);
      expect(state.storage.sql.exec('SELECT * FROM operations').toArray()).toHaveLength(2);
    });
  });

  it('deduplicates concurrent retries before applying geometry twice', async () => {
    const mapId = 'concurrent-retry';
    const cell = env.MAP_CELLS.getByName(mapId);
    const initial = createStarterDocument();
    await cell.initialize(mapId, serializeMap(initial));
    const starter = (await cell.snapshot(mapId)).document as unknown as MapDocument;
    const after = insertBrush(
      starter,
      starter.entities[0]!.id,
      createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', createSequentialIdFactory('concurrent')),
    );
    const edit = operation(starter, after);
    const acknowledgements = await Promise.all([
      cell.submit('alice', edit),
      cell.submit('alice', edit),
    ]);
    expect(acknowledgements[0]).toEqual(acknowledgements[1]);
    expect(await cell.snapshot(mapId)).toMatchObject({ mapVersion: 1 });
  });

  it('survives repeated edits and eviction without a second source authority', async () => {
    const mapId = 'sustained';
    const cell = env.MAP_CELLS.getByName(mapId);
    const initial = createStarterDocument();
    await cell.initialize(mapId, serializeMap(initial));
    let document = (await cell.snapshot(mapId)).document as unknown as MapDocument;
    const ids = createSequentialIdFactory('sustained');
    for (let index = 0; index < 100; index += 1) {
      const next = insertBrush(
        document,
        document.entities[0]!.id,
        createBoxBrush([index * 80, 0, 0], [index * 80 + 64, 64, 64], 'STONE', ids),
      );
      const edit = {
        ...operation(document, next),
        operationId: `alice:${index}`,
        transactionId: `alice:${index}`,
        baseMapVersion: index,
      };
      expect(await cell.submit('alice', edit)).toMatchObject({
        type: 'ack',
        mapVersion: index + 1,
      });
      document = next;
    }
    await evictDurableObject(cell);
    const recovered = await cell.snapshot(mapId);
    expect(recovered.mapVersion).toBe(100);
    expect(recovered.document.entities[0]!.primitives).toHaveLength(
      document.entities[0]!.primitives.length,
    );
    expect(recovered.source).toBe(serializeMap(document));
  });

  it('does not advance canonical state for a conflicting operation', async () => {
    const mapId = 'conflict';
    const cell = env.MAP_CELLS.getByName(mapId);
    const starter = createStarterDocument();
    await cell.initialize(mapId, serializeMap(starter));
    const brush = starter.entities[0]!.primitives[0]!;
    if (brush.kind !== 'brush') throw new Error('Expected starter brush');
    const moved = {
      ...starter,
      entities: starter.entities.with(0, {
        ...starter.entities[0]!,
        primitives: [translateBrush(brush, [16, 0, 0])],
      }),
    };
    const edit = operation(starter, moved);
    const invalid = {
      ...edit,
      operationId: 'alice:bad',
      // oxlint-disable-next-line no-map-spread -- immutable fixture corrupts one revision deliberately.
      edits: edit.edits.map((candidate) =>
        candidate.kind === 'replace-brush' ? { ...candidate, baseRevision: 999 } : candidate,
      ),
    };
    expect(await cell.submit('alice', invalid)).toMatchObject({ type: 'conflict' });
    expect(await cell.snapshot(mapId)).toMatchObject({
      mapVersion: 0,
      source: serializeMap(starter),
    });
  });
});
