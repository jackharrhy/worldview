import type { HostedBuild } from '@worldview/protocol';
import { describe, expect, test, vi } from 'vitest';
import { HostedMapBuildService } from '../src/hosted-map-build-service.js';

const enabledCapabilityFetch: typeof fetch = async function (this: unknown) {
  // Native browser fetch requires the Window receiver; keep this production regression covered.
  expect(this).toBe(globalThis);
  return Response.json({ builds: [], capability: { profileId: 'default' } });
};

function build(status: HostedBuild['status'], result: HostedBuild['result'] = null): HostedBuild {
  return {
    id: 'build-1',
    mapVersion: 4,
    profileId: 'default',
    quality: 'preview',
    status,
    sourceSha256: status === 'queued' ? null : 'b'.repeat(64),
    result,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('HostedMapBuildService', () => {
  test('advertises only compiler profiles enabled by the host', async () => {
    const enabled = new HostedMapBuildService({
      mapId: 'map-1',
      game: 'quake',
      fetch: enabledCapabilityFetch,
    });
    const disabled = new HostedMapBuildService({
      mapId: 'map-2',
      game: 'goldsrc',
      fetch: async () => Response.json({ builds: [], capability: null }),
    });
    await expect(enabled.capabilities()).resolves.toMatchObject({
      compileProfiles: [{ id: 'default', game: 'quake' }],
    });
    await expect(disabled.capabilities()).resolves.toMatchObject({ compileProfiles: [] });
  });

  test('builds the canonical map, waits for completion, and downloads artifacts', async () => {
    const bsp = Uint8Array.from([29, 0, 0, 0]);
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    let polls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'POST')
        return Response.json({ build: build('queued') }, { status: 202 });
      if (url.endsWith(`/artifacts/${'a'.repeat(64)}`)) return new Response(bsp);
      polls += 1;
      return Response.json({
        builds: [
          polls === 1
            ? build('running')
            : build('succeeded', {
                diagnostics: [],
                logs: [{ stage: 'qbsp', text: 'built', truncated: false }],
                elapsedMilliseconds: 12,
                artifacts: [
                  {
                    name: 'room.bsp',
                    kind: 'bsp',
                    mediaType: 'application/octet-stream',
                    sha256: 'a'.repeat(64),
                    size: 4,
                  },
                ],
              }),
        ],
        capability: { profileId: 'default' },
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
      signal: controller.signal,
    });

    expect(removeListener).toHaveBeenCalledTimes(2);
    expect(removeListener.mock.calls).toEqual(
      addListener.mock.calls.map(([event, listener]) => [event, listener]),
    );
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

  test('cancels before polling when the request aborts as submission completes', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      controller.abort(new Error('Build cancelled'));
      return Response.json({ build: build('queued') }, { status: 202 });
    });
    const service = new HostedMapBuildService({ mapId: 'map-1', game: 'quake', fetch: fetchImpl });
    await expect(
      service.compile({
        mapName: 'room.map',
        mapText: '',
        quality: 'preview',
        expectedDocumentRevision: 4,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Build cancelled');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
