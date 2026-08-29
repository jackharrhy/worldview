import { describe, expect, test, vi } from 'vitest';
import { HostedMapBuildService } from '../src/hosted-map-build-service.js';

describe('HostedMapBuildService', () => {
  test('advertises only compiler profiles enabled by the host', async () => {
    const enabled = new HostedMapBuildService({
      mapId: 'map-1',
      game: 'quake',
      fetch: async () => Response.json({ capability: { profileId: 'default' } }),
    });
    const disabled = new HostedMapBuildService({
      mapId: 'map-2',
      game: 'goldsrc',
      fetch: async () => Response.json({ capability: null }),
    });
    await expect(enabled.capabilities()).resolves.toMatchObject({
      compileProfiles: [{ id: 'default', game: 'quake' }],
    });
    await expect(disabled.capabilities()).resolves.toMatchObject({ compileProfiles: [] });
  });

  test('builds the canonical map, waits for completion, and downloads artifacts', async () => {
    const bsp = Uint8Array.from([29, 0, 0, 0]);
    let polls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST')
        return Response.json(
          { build: { id: 'build-1', mapVersion: 4, status: 'queued', result: null } },
          { status: 202 },
        );
      if (url.endsWith(`/artifacts/${'a'.repeat(64)}`)) return new Response(bsp);
      polls += 1;
      return Response.json({
        builds: [
          polls === 1
            ? { id: 'build-1', mapVersion: 4, status: 'running', result: null }
            : {
                id: 'build-1',
                mapVersion: 4,
                status: 'succeeded',
                result: {
                  diagnostics: [],
                  logs: [{ stage: 'qbsp', text: 'built', truncated: false }],
                  elapsedMilliseconds: 12,
                  artifacts: [
                    {
                      name: 'room.bsp',
                      kind: 'bsp',
                      mediaType: 'application/octet-stream',
                      sha256: 'a'.repeat(64),
                    },
                  ],
                },
              },
        ],
      });
    });
    const service = new HostedMapBuildService({
      mapId: 'map/one',
      game: 'quake',
      fetch: fetchImpl,
      pollIntervalMilliseconds: 0,
    });

    const result = await service.compile({
      mapName: 'room.map',
      mapText: 'ignored local source',
      quality: 'preview',
      expectedDocumentRevision: 4,
    });

    expect(result).toMatchObject({
      status: 'succeeded',
      buildId: 'build-1',
      sourceDocumentRevision: 4,
      elapsedMilliseconds: 12,
    });
    expect(new Uint8Array(result.artifacts[0]!.data)).toEqual(bsp);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/maps/map%2Fone/builds',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ quality: 'preview', expectedMapVersion: 4 }),
      }),
    );
  });

  test('surfaces service admission and snapshot errors', async () => {
    const service = new HostedMapBuildService({
      mapId: 'map-1',
      game: 'quake',
      fetch: async () => Response.json({ error: 'Wait for the hosted save' }, { status: 409 }),
    });
    await expect(
      service.compile({
        mapName: 'room.map',
        mapText: '',
        quality: 'preview',
        expectedDocumentRevision: 8,
      }),
    ).rejects.toThrow('Wait for the hosted save');
  });
});
