import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { FileBlobStore } from '../src/blob-store.js';
import { WorldviewDatabase } from '../src/database.js';
import { createWorldviewService } from '../src/server.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function fixture(fetchImpl?: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), 'worldview-service-test-'));
  const database = new WorldviewDatabase(join(root, 'worldview.db'));
  const server = createWorldviewService({
    database,
    blobs: new FileBlobStore(join(root, 'blobs')),
    oauth: {
      fourmUrl: 'https://4orm.example',
      clientId: 'worldview',
      publicUrl: 'http://127.0.0.1',
    },
    realtimeTicketSecret: 'test-worldview-realtime-ticket-secret-0001',
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
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
  return { origin, root, database };
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
    const map = ((await mapResponse.json()) as { map: { id: string; roomId: string } }).map;
    expect(map.roomId).toMatch(/^hosted_[0-9a-f-]{36}$/);
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

  test('autosaves source with optimistic versions and retains named checkpoints', async () => {
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
    const source = '{\n"classname" "worldspawn"\n"message" "saved"\n}\n';
    const saved = await fetch(`${app.origin}/api/maps/${map.id}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, expectedVersion: 0 }),
    });
    expect(await saved.json()).toMatchObject({
      sourceVersion: 1,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const stale = await fetch(`${app.origin}/api/maps/${map.id}`, {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'stale', expectedVersion: 0 }),
    });
    expect(stale.status).toBe(409);
    const checkpoint = await fetch(`${app.origin}/api/maps/${map.id}/checkpoints`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First room' }),
    });
    expect(await checkpoint.json()).toMatchObject({
      checkpoint: { name: 'First room', sourceVersion: 1 },
    });
    expect(
      await (
        await fetch(`${app.origin}/api/maps/${map.id}`, { headers: { Cookie: cookie } })
      ).json(),
    ).toMatchObject({ map: { source, sourceVersion: 1 } });
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
    const bytes = new TextEncoder().encode('{\n"classname" "worldspawn"\n}\n');
    const blob = await new FileBlobStore(join(app.root, 'blobs')).put(bytes);
    const map = app.database.createMap({
      projectId: project.id,
      userId: user.id,
      name: 'quota.map',
      format: 'quake',
      sourceHash: blob.sha256,
      sourceFingerprint: blob.sha256,
    });
    const mapId = String(map.id);
    expect(app.database.buildAdmission(user.id)).toBe('allowed');
    const active = app.database.createBuild({
      mapId,
      userId: user.id,
      sourceVersion: 0,
      profileId: 'default',
      quality: 'preview',
    });
    expect(app.database.buildAdmission(user.id)).toBe('user-active');
    app.database.updateBuild(active.id, 'failed');
    for (let index = 1; index < 6; index += 1) {
      const build = app.database.createBuild({
        mapId,
        userId: user.id,
        sourceVersion: 0,
        profileId: 'default',
        quality: 'preview',
      });
      app.database.updateBuild(build.id, 'failed');
    }
    expect(app.database.buildAdmission(user.id)).toBe('user-hourly');
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
