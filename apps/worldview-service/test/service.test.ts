import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createStarterDocument } from '@jackharrhy/worldview-editor/core';
import { FileBlobStore } from '../src/blob-store.js';
import { RemoteBuildQueue } from '../src/build-queue.js';
import { WorldviewDatabase } from '../src/database.js';
import { createWorldviewService } from '../src/server.js';
import type { HostedMapCheckpoint, HostedMapSnapshot } from '../src/map-cell-client.js';

class FakeMapCells {
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
    _actorId: string,
  ): Promise<HostedMapCheckpoint> {
    this.checkpoints.push({ mapId, name });
    return {
      id: 'checkpoint-1',
      name,
      mapVersion: (await this.snapshot(mapId)).mapVersion,
      createdAt: Date.now(),
    };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function fixture(fetchImpl?: typeof fetch, compilerFetch?: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), 'worldview-service-test-'));
  const database = new WorldviewDatabase(join(root, 'worldview.db'));
  const maps = new FakeMapCells();
  const blobs = new FileBlobStore(join(root, 'blobs'));
  const server = createWorldviewService({
    database,
    blobs,
    oauth: {
      fourmUrl: 'https://4orm.example',
      clientId: 'worldview',
      publicUrl: 'http://127.0.0.1',
    },
    realtimeTicketSecret: 'test-worldview-realtime-ticket-secret-0001',
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
  });
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
  return { origin, root, database, maps };
}

function session(database: WorldviewDatabase) {
  const user = database.upsertUser({
    fourmSub: 'fourm-1',
    username: 'mapper',
    displayName: 'Mapper',
    isAdmin: false,
  });
  return { user, cookie: `worldview_session=${database.createSession(user.id).token}` };
}

const malformedHumanTokenFetch: typeof fetch = async (input) => {
  if (String(input).endsWith('/oauth/token'))
    return Response.json({
      access_token: 'access-token',
      token_type: 'Basic',
      expires_in: 'forever',
    });
  throw new Error('Userinfo must not be requested for an invalid token response');
};

const successfulCompilerFetch: typeof fetch = async (_input, init) => {
  const request = JSON.parse(String(init?.body)) as {
    mapText: string;
    expectedDocumentRevision: number;
  };
  expect(request.mapText).toContain('worldspawn');
  expect(request.expectedDocumentRevision).toBe(0);
  return Response.json({
    status: 'succeeded',
    diagnostics: [],
    logs: [{ stage: 'qbsp', text: 'built', truncated: false }],
    elapsedMilliseconds: 7,
    artifacts: [
      {
        name: 'showcase.bsp',
        kind: 'bsp',
        mediaType: 'application/octet-stream',
        base64: Buffer.from([29, 0, 0, 0]).toString('base64'),
      },
    ],
  });
};

describe('Worldview hosted project service', () => {
  test('creates private projects and keeps remote maps behind a 4orm session', async () => {
    const app = await fixture();
    const { cookie } = session(app.database);
    const projectResponse = await fetch(`${app.origin}/api/projects`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lambda Complex', game: 'goldsrc' }),
    });
    expect(projectResponse.status).toBe(201);
    const project = ((await projectResponse.json()) as { project: { id: string; role: string } })
      .project;
    expect(project.role).toBe('owner');

    const mapResponse = await fetch(`${app.origin}/api/projects/${project.id}/maps`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-chamber.map',
        format: 'valve-220',
        source: '{\n"classname" "worldspawn"\n}\n',
      }),
    });
    expect(mapResponse.status).toBe(201);
    const map = ((await mapResponse.json()) as { map: { id: string; mapVersion: number } }).map;
    expect(map.mapVersion).toBe(0);
    const projectState = await fetch(`${app.origin}/api/projects/${project.id}`, {
      headers: { Cookie: cookie },
    });
    expect(await projectState.json()).toMatchObject({
      project: { name: 'Lambda Complex', maps: [{ id: map.id, name: 'test-chamber.map' }] },
    });

    const guestResponse = await fetch(`${app.origin}/api/guest-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'no-accountless-access' }),
    });
    expect(guestResponse.status).toBe(404);
    expect((await fetch(`${app.origin}/api/maps/${map.id}`)).status).toBe(404);
    expect(
      (await fetch(`${app.origin}/api/maps/${map.id}/realtime-ticket`, { method: 'POST' })).status,
    ).toBe(404);

    const hashes = await readFile(join(app.root, 'worldview.db'));
    expect(hashes.byteLength).toBeGreaterThan(0);
  });

  test('loads source and creates checkpoints through the authoritative MapCell', async () => {
    const app = await fixture();
    const { cookie } = session(app.database);
    const project = (
      (await (
        await fetch(`${app.origin}/api/projects`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Autosave', game: 'quake' }),
        })
      ).json()) as { project: { id: string } }
    ).project;
    const map = (
      (await (
        await fetch(`${app.origin}/api/projects/${project.id}/maps`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'autosave.map', format: 'quake' }),
        })
      ).json()) as { map: { id: string } }
    ).map;
    const initial = await app.maps.snapshot(map.id);
    const source = '{\n"classname" "worldspawn"\n"message" "canonical"\n}\n';
    app.maps.snapshots.set(map.id, {
      ...initial,
      source,
      mapVersion: 7,
      sourceSha256: 'b'.repeat(64),
    });
    const checkpoint = await fetch(`${app.origin}/api/maps/${map.id}/checkpoints`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First room' }),
    });
    expect(await checkpoint.json()).toMatchObject({
      checkpoint: { name: 'First room', mapVersion: 7 },
    });
    expect(
      await (
        await fetch(`${app.origin}/api/maps/${map.id}`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ map: { source, mapVersion: 7, sourceSha256: 'b'.repeat(64) } });
  });

  test('does not expose map metadata when MapCell initialization fails', async () => {
    const app = await fixture();
    const { cookie } = session(app.database);
    const project = (
      (await (
        await fetch(`${app.origin}/api/projects`, {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Atomic creation', game: 'quake' }),
        })
      ).json()) as { project: { id: string } }
    ).project;
    app.maps.initialize = async () => {
      throw new Error('MapCell unavailable');
    };
    const response = await fetch(`${app.origin}/api/projects/${project.id}/maps`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'missing.map', format: 'quake' }),
    });
    expect(response.status).toBe(500);
    expect(
      await (
        await fetch(`${app.origin}/api/projects/${project.id}`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ project: { maps: [] } });
  });

  test('isolates project listings by membership and rejects cross-origin mutations', async () => {
    const app = await fixture();
    const owner = session(app.database);
    const outsider = app.database.upsertUser({
      fourmSub: 'fourm-2',
      username: 'outsider',
      displayName: 'Outsider',
      isAdmin: false,
    });
    const outsiderCookie = `worldview_session=${app.database.createSession(outsider.id).token}`;
    await fetch(`${app.origin}/api/projects`, {
      method: 'POST',
      headers: { Cookie: owner.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Private', game: 'quake' }),
    });
    const listing = await fetch(`${app.origin}/api/projects`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(await listing.json()).toEqual({ projects: [] });
    const rejected = await fetch(`${app.origin}/api/projects`, {
      method: 'POST',
      headers: {
        Cookie: owner.cookie,
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Nope', game: 'quake' }),
    });
    expect(rejected.status).toBe(403);
  });

  test('admits only one active build per user and bounds hourly build attempts', async () => {
    const app = await fixture();
    const { user } = session(app.database);
    const project = app.database.createProject(user.id, 'Build quota', 'quake');
    const map = app.database.createMap({
      id: crypto.randomUUID(),
      projectId: project.id,
      userId: user.id,
      name: 'quota.map',
      format: 'quake',
    });
    const mapId = String(map.id);
    expect(app.database.buildAdmission(user.id)).toBe('allowed');
    const active = app.database.createBuild({
      mapId,
      userId: user.id,
      mapVersion: 0,
      profileId: 'default',
      quality: 'preview',
    });
    expect(app.database.buildAdmission(user.id)).toBe('user-active');
    app.database.updateBuild(active.id, 'failed');
    for (let index = 1; index < 6; index += 1) {
      const build = app.database.createBuild({
        mapId,
        userId: user.id,
        mapVersion: 0,
        profileId: 'default',
        quality: 'preview',
      });
      app.database.updateBuild(build.id, 'failed');
    }
    expect(app.database.buildAdmission(user.id)).toBe('user-hourly');
  });

  test('builds canonical hosted maps and serves artifacts only to project members', async () => {
    const app = await fixture(undefined, successfulCompilerFetch);
    const { user, cookie } = session(app.database);
    const project = app.database.createProject(user.id, 'Hosted build', 'quake');
    const map = app.database.createMap({
      id: crypto.randomUUID(),
      projectId: project.id,
      userId: user.id,
      name: 'showcase.map',
      format: 'quake',
    });
    const mapId = String(map.id);
    await app.maps.initialize(mapId, '{\n"classname" "worldspawn"\n}\n');

    const stale = await fetch(`${app.origin}/api/maps/${map.id}/builds`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality: 'preview', expectedMapVersion: 9 }),
    });
    expect(stale.status).toBe(409);
    const queued = await fetch(`${app.origin}/api/maps/${map.id}/builds`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quality: 'preview', expectedMapVersion: 0 }),
    });
    expect(queued.status).toBe(202);
    const buildId = ((await queued.json()) as { build: { id: string } }).build.id;

    await expect
      .poll(async () => {
        const response = await fetch(`${app.origin}/api/maps/${map.id}/builds`, {
          headers: { Cookie: cookie },
        });
        const builds = (await response.json()) as {
          builds: readonly { id: string; status: string; result?: { artifacts?: unknown[] } }[];
        };
        return builds.builds.find(({ id }) => id === buildId);
      })
      .toMatchObject({ status: 'succeeded', result: { artifacts: [expect.any(Object)] } });
    const build = app.database.build(mapId, buildId, user.id)!;
    const artifact = build.result!.artifacts![0]!;
    const artifactUrl = `${app.origin}/api/maps/${map.id}/builds/${buildId}/artifacts/${artifact.sha256}`;
    expect((await fetch(artifactUrl)).status).toBe(401);
    const downloaded = await fetch(artifactUrl, { headers: { Cookie: cookie } });
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(Uint8Array.from([29, 0, 0, 0]));
  });

  test('completes the existing 4orm PKCE flow into a Worldview session', async () => {
    const calls: string[] = [];
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/oauth/token'))
        return Response.json({
          access_token: 'access-token',
          token_type: 'Bearer',
          expires_in: 300,
        });
      if (url.endsWith('/oauth/userinfo'))
        return Response.json({
          sub: '42',
          username: 'gordon',
          display_name: 'Gordon',
          is_admin: false,
        });
      return new Response('not found', { status: 404 });
    };
    const app = await fixture(mockFetch);
    const login = await fetch(
      `${app.origin}/auth/login?returnTo=${encodeURIComponent('/projects/example')}`,
      { redirect: 'manual' },
    );
    expect(login.status).toBe(303);
    const authorize = new URL(login.headers.get('location')!);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const state = authorize.searchParams.get('state')!;
    const oauthCookie = login.headers.get('set-cookie')!.split(';', 1)[0]!;
    const callback = await fetch(
      `${app.origin}/auth/callback?code=code-1&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie }, redirect: 'manual' },
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/projects/example');
    const callbackCookies = callback.headers.getSetCookie();
    expect(callbackCookies).toHaveLength(2);
    expect(callbackCookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('worldview_oauth=;'),
        expect.stringContaining('worldview_session='),
      ]),
    );
    expect(calls).toEqual([
      'https://4orm.example/oauth/token',
      'https://4orm.example/oauth/userinfo',
    ]);
  });

  test('validates, consumes, and clears OAuth state when authorization is denied', async () => {
    const app = await fixture();
    const login = await fetch(`${app.origin}/auth/login`, { redirect: 'manual' });
    const authorize = new URL(login.headers.get('location')!);
    const state = authorize.searchParams.get('state')!;
    const oauthCookie = login.headers.get('set-cookie')!.split(';', 1)[0]!;
    const denial = await fetch(
      `${app.origin}/auth/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie }, redirect: 'manual' },
    );

    expect(denial.status).toBe(303);
    expect(denial.headers.get('location')).toBe('/?authError=access_denied');
    expect(denial.headers.getSetCookie()).toEqual([expect.stringContaining('worldview_oauth=;')]);

    const replay = await fetch(
      `${app.origin}/auth/callback?code=replay&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie }, redirect: 'manual' },
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toEqual({
      error: 'OAuth transaction is missing or expired',
    });
    expect(replay.headers.getSetCookie()).toEqual([expect.stringContaining('worldview_oauth=;')]);
  });

  test('rejects malformed human token metadata and clears the OAuth cookie', async () => {
    const app = await fixture(malformedHumanTokenFetch);
    const login = await fetch(`${app.origin}/auth/login`, { redirect: 'manual' });
    const authorize = new URL(login.headers.get('location')!);
    const state = authorize.searchParams.get('state')!;
    const oauthCookie = login.headers.get('set-cookie')!.split(';', 1)[0]!;
    const callback = await fetch(
      `${app.origin}/auth/callback?code=code-1&state=${encodeURIComponent(state)}`,
      { headers: { Cookie: oauthCookie }, redirect: 'manual' },
    );

    expect(callback.status).toBe(500);
    expect(callback.headers.getSetCookie()).toEqual([expect.stringContaining('worldview_oauth=;')]);
    expect(await callback.json()).toEqual({ error: 'Internal server error' });
  });
});
