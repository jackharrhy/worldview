import { signRealtimeTicket } from './realtime-ticket.js';
import type { MapDocument } from '@jackharrhy/worldview-editor/core';

export interface HostedMapSnapshot {
  readonly mapId: string;
  readonly mapVersion: number;
  readonly document: MapDocument;
  readonly source: string;
  readonly sourceSha256: string;
}

export interface HostedMapCheckpoint {
  readonly id: string;
  readonly name: string;
  readonly mapVersion: number;
  readonly createdAt: number;
}

export class MapCellClient {
  public constructor(
    private readonly endpoint: string,
    private readonly secret: string,
    private readonly fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  private ticket(mapId: string, actorId = 'worldview-service'): string {
    return signRealtimeTicket(
      {
        version: 2,
        mapId,
        principalId: 'worldview-service',
        actorId,
        role: 'owner',
        expiresAt: Date.now() + 60_000,
      },
      this.secret,
    );
  }

  private async request(
    mapId: string,
    action: string,
    init: RequestInit = {},
    actorId?: string,
  ): Promise<Response> {
    const response = await this.fetcher(
      new URL(`/sync/maps/${encodeURIComponent(mapId)}/${action}`, this.endpoint),
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.ticket(mapId, actorId)}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`MapCell ${action} failed (${response.status}): ${detail}`);
    }
    return response;
  }

  public async initialize(mapId: string, source: string): Promise<HostedMapSnapshot> {
    return (await (
      await this.request(mapId, 'initialize', {
        method: 'PUT',
        body: JSON.stringify({ source }),
      })
    ).json()) as HostedMapSnapshot;
  }

  public async snapshot(mapId: string): Promise<HostedMapSnapshot> {
    return (await (await this.request(mapId, 'snapshot')).json()) as HostedMapSnapshot;
  }

  public async createCheckpoint(
    mapId: string,
    name: string,
    actorId: string,
  ): Promise<HostedMapCheckpoint> {
    return (
      (await (
        await this.request(
          mapId,
          'checkpoints',
          {
            method: 'POST',
            body: JSON.stringify({ name }),
          },
          actorId,
        )
      ).json()) as { checkpoint: HostedMapCheckpoint }
    ).checkpoint;
  }
}
