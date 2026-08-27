import { env } from 'cloudflare:workers';
import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  collaborationEditsBetween,
  createBoxBrush,
  createSequentialIdFactory,
  createStarterDocument,
  insertBrush,
  translateBrush,
  type CollaborationOperation,
} from '@jackharrhy/worldview-editor/core';
import type { MapRoom } from '../src/map-room.js';
import { parseClientFrame } from '../src/protocol.js';

describe('MapRoom', () => {
  it('persists an idempotent operation and snapshot across eviction', async () => {
    const room = env.MAP_ROOMS.getByName('persistence');
    const ids = createSequentialIdFactory('room');
    const starter = createStarterDocument();
    const brush = createBoxBrush([0, 0, 0], [64, 64, 64], 'STONE', ids);
    const baseline = insertBrush(
      {
        ...starter,
        entities: starter.entities.with(0, {
          ...starter.entities[0]!,
          properties: {
            ...starter.entities[0]!.properties,
            _checkpointPadding: 'x'.repeat(150_000),
          },
        }),
      },
      starter.entities[0]!.id,
      brush,
    );
    const world = baseline.entities[0]!;
    await room.initializeBaseline('persistence', baseline);
    await runInDurableObject(room, (_instance: MapRoom, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>('SELECT COUNT(*) AS count FROM checkpoint_chunks')
          .one().count,
      ).toBeGreaterThan(1);
    });
    const after = {
      ...baseline,
      entities: baseline.entities.with(0, {
        ...world,
        brushes: world.brushes.map((candidate) =>
          candidate.id === brush.id ? translateBrush(brush, [16, 0, 0]) : candidate,
        ),
      }),
    };
    const operation: CollaborationOperation = {
      schemaVersion: 1,
      operationId: 'alice:1',
      transactionId: 'alice:1',
      actorId: 'alice',
      baseRoomVersion: 0,
      label: 'Move brush',
      edits: collaborationEditsBetween(baseline, after),
    };

    expect((await room.submit('alice', operation)).type).toBe('ack');
    expect((await room.snapshot()).roomVersion).toBe(1);
    await evictDurableObject(room);
    const recovered = await room.snapshot();
    expect(recovered.roomVersion).toBe(1);
    expect(recovered.document?.revision).toBe(baseline.revision + 1);
  });

  it('rejects malformed operations before they reach room state', () => {
    expect(() =>
      parseClientFrame(
        JSON.stringify({
          type: 'operation',
          operation: {
            schemaVersion: 1,
            operationId: 'bad',
            transactionId: 'bad',
            actorId: 'mallory',
            baseRoomVersion: 0,
            label: 'Malformed',
            edits: [{ kind: 'replace-brush', brushId: 'brush', baseRevision: 0 }],
          },
        }),
      ),
    ).toThrow('Invalid collaboration operation');
  });
});
