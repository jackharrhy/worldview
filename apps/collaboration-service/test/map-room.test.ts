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
  translateBrush,
  type CollaborationOperation,
} from '@jackharrhy/worldview-editor/core';
import type { MapRoom } from '../src/map-room.js';
import { parseClientFrame } from '../src/protocol.js';

function hostedTicket(roomId: string, role: 'owner' | 'editor' | 'viewer' = 'editor') {
  const header = Buffer.from(JSON.stringify({ algorithm: 'HS256', type: 'WVT' })).toString(
    'base64url',
  );
  const content = Buffer.from(
    JSON.stringify({
      version: 1,
      mapId: 'map-1',
      roomId,
      principalId: 'user-1',
      actorId: 'user-1',
      role,
      expiresAt: Date.now() + 60_000,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', env.WORLDVIEW_TICKET_SECRET)
    .update(`${header}.${content}`)
    .digest('base64url');
  return `${header}.${content}.${signature}`;
}

describe('MapRoom', () => {
  it('allows accountless editor origins to initialize rooms through CORS', async () => {
    const response = await SELF.fetch('https://collaboration.test/rooms/cors-room', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://editor.test',
        'Access-Control-Request-Method': 'PUT',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
  });

  it('requires and validates signed access for hosted map rooms', async () => {
    const roomId = 'hosted_00000000-0000-0000-0000-000000000001';
    expect((await SELF.fetch(`https://collaboration.test/rooms/${roomId}`)).status).toBe(401);
    const response = await SELF.fetch(`https://collaboration.test/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${hostedTicket(roomId)}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ roomVersion: 0, document: null });
  });

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
        primitives: world.primitives.map((candidate) =>
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

  it('accepts bounded ephemeral gesture previews and rejects malformed pointers', () => {
    const frame = parseClientFrame(
      JSON.stringify({
        type: 'presence',
        presence: {
          actorId: 'alice',
          color: 'red',
          viewport: 'xy',
          pointer: [32, 64, 0],
          sentAt: 1,
          preview: {
            interactionId: 'drag-1',
            sequence: 4,
            baseRoomVersion: 2,
            edits: [{ kind: 'delete-brush', brushId: 'brush', baseRevision: 0 }],
          },
        },
      }),
    );
    expect(frame.type).toBe('presence');
    expect(() =>
      parseClientFrame(
        JSON.stringify({
          type: 'presence',
          presence: { actorId: 'alice', pointer: [0, 'bad', 0], sentAt: 1 },
        }),
      ),
    ).toThrow('Invalid presence payload');
  });
});
