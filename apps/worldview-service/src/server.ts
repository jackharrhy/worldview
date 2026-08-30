import { createReadStream, mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlobStore, type BlobStore } from './blob-store.js';
import { WorldviewDatabase, type ProjectRole, type WorldviewUser } from './database.js';
import {
  beginAuthorization,
  completeAuthorization,
  consumeAuthorizationTransaction,
  type OAuthConfig,
} from './oauth.js';
import { signRealtimeTicket } from './realtime-ticket.js';
import { ArtbinClient } from './artbin.js';
import { RemoteBuildQueue } from './build-queue.js';
import {
  MapCellClient,
  type HostedMapCheckpoint,
  type HostedMapSnapshot,
} from './map-cell-client.js';

export interface HostedMapStore {
  initialize(mapId: string, source: string): Promise<HostedMapSnapshot>;
  snapshot(mapId: string): Promise<HostedMapSnapshot>;
  createCheckpoint(mapId: string, name: string, actorId: string): Promise<HostedMapCheckpoint>;
}

const SESSION_COOKIE = 'worldview_session';
const OAUTH_COOKIE = 'worldview_oauth';
const MAX_HOSTED_MAP_BYTES = 2 * 1024 * 1024;

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

function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of request.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function setCookie(
  response: ServerResponse,
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): void {
  const serialized = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure ? '; Secure' : ''}`;
  const existing = response.getHeader('Set-Cookie');
  response.setHeader('Set-Cookie', [
    ...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []),
    serialized,
  ]);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  const payload = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

async function body(
  request: IncomingMessage,
  limit = 1024 * 1024,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw Object.assign(new Error('Request body is too large'), { status: 413 });
    chunks.push(bytes);
  }
  if (size === 0) return {};
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Object.assign(new Error('JSON object required'), { status: 400 });
  return value as Record<string, unknown>;
}

function mutationAllowed(request: IncomingMessage, publicUrl: string): boolean {
  const site = request.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = request.headers.origin;
  return !origin || origin === new URL(publicUrl).origin;
}

function text(value: unknown, field: string, maximum = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum)
    throw Object.assign(new Error(`${field} is invalid`), { status: 400 });
  return value.trim();
}

function emptyMap(format: 'valve-220' | 'quake'): string {
  return format === 'valve-220'
    ? '{\n"classname" "worldspawn"\n}\n'
    : '{\n"classname" "worldspawn"\n}\n';
}

function userFor(request: IncomingMessage, database: WorldviewDatabase): WorldviewUser | null {
  return database.sessionUser(cookie(request, SESSION_COOKIE));
}

function requireUser(
  request: IncomingMessage,
  response: ServerResponse,
  database: WorldviewDatabase,
): WorldviewUser | null {
  const user = userFor(request, database);
  if (!user) json(response, 401, { error: 'Authentication required' });
  return user;
}

function mapPrincipal(database: WorldviewDatabase, mapId: string, user: WorldviewUser) {
  const map = database.map(mapId, user.id);
  return map
    ? {
        map,
        actorId: user.id,
        displayName: user.displayName,
        principalId: user.id,
        user,
      }
    : null;
}

function canEdit(role: ProjectRole | null): role is 'owner' | 'editor' {
  return role === 'owner' || role === 'editor';
}

const mediaTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function staticResponse(
  pathname: string,
  root: string,
  response: ServerResponse,
): Promise<boolean> {
  const candidate = pathname === '/' ? 'index.html' : pathname.slice(1);
  const relative = normalize(candidate).replace(/^(?:\.\.[/\\])+/, '');
  let path = join(root, relative);
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
  } catch {
    if (extname(relative)) return false;
    path = join(root, 'index.html');
    try {
      await stat(path);
    } catch {
      return false;
    }
  }
  response.writeHead(200, {
    'Content-Type': mediaTypes[extname(path)] ?? 'application/octet-stream',
  });
  createReadStream(path).pipe(response);
  return true;
}

export function createWorldviewService(options: WorldviewServiceOptions) {
  const secure = new URL(options.oauth.publicUrl).protocol === 'https:';
  const server = createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', options.oauth.publicUrl);
      if (request.method === 'GET' && url.pathname === '/health')
        return json(response, 200, { status: 'ok' });
      if (request.method === 'GET' && url.pathname === '/auth/login') {
        const auth = beginAuthorization(
          options.database,
          options.oauth,
          url.searchParams.get('returnTo') ?? '/',
        );
        setCookie(response, OAUTH_COOKIE, auth.state, 600, secure);
        return redirect(response, auth.url);
      }
      if (request.method === 'GET' && url.pathname === '/auth/callback') {
        const cookieState = cookie(request, OAUTH_COOKIE);
        setCookie(response, OAUTH_COOKIE, '', 0, secure);
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');
        if (error) {
          if (!state) return json(response, 400, { error: 'OAuth state is required' });
          consumeAuthorizationTransaction({
            database: options.database,
            state,
            cookieState,
          });
          return redirect(response, `/?authError=${encodeURIComponent(error)}`);
        }
        const code = url.searchParams.get('code');
        if (!state || !code)
          return json(response, 400, { error: 'OAuth code and state are required' });
        const completed = await completeAuthorization({
          database: options.database,
          config: options.oauth,
          state,
          code,
          cookieState,
          fetch: options.fetch ?? globalThis.fetch,
        });
        const session = options.database.createSession(completed.user.id);
        setCookie(
          response,
          SESSION_COOKIE,
          session.token,
          (session.expiresAt - Date.now()) / 1000,
          secure,
        );
        return redirect(response, completed.returnTo);
      }
      if (request.method === 'POST' && url.pathname === '/auth/logout') {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        options.database.deleteSession(cookie(request, SESSION_COOKIE));
        setCookie(response, SESSION_COOKIE, '', 0, secure);
        return json(response, 200, { ok: true });
      }
      if (request.method === 'GET' && url.pathname === '/api/session') {
        const user = userFor(request, options.database);
        return json(response, 200, { user });
      }
      if (request.method === 'GET' && url.pathname === '/api/projects') {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        return json(response, 200, { projects: options.database.listProjects(user.id) });
      }
      if (request.method === 'GET' && url.pathname === '/api/assets/search') {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        if (!options.artbin)
          return json(response, 503, { error: 'Artbin integration is not configured' });
        const parameters = new URLSearchParams();
        for (const key of ['q', 'kind', 'folderId', 'tag', 'cursor', 'limit']) {
          const value = url.searchParams.get(key);
          if (value) parameters.set(key, value);
        }
        return json(response, 200, await options.artbin.search(parameters));
      }
      if (request.method === 'POST' && url.pathname === '/api/projects') {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const input = await body(request);
        const game = input.game;
        if (game !== 'quake' && game !== 'goldsrc')
          return json(response, 400, { error: 'game must be quake or goldsrc' });
        return json(response, 201, {
          project: options.database.createProject(user.id, text(input.name, 'name'), game),
        });
      }
      const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && projectMatch) {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const project = options.database.project(decodeURIComponent(projectMatch[1]!), user.id);
        return project
          ? json(response, 200, { project })
          : json(response, 404, { error: 'Project not found' });
      }
      const membersMatch = /^\/api\/projects\/([^/]+)\/members$/.exec(url.pathname);
      if (request.method === 'GET' && membersMatch) {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const users = options.database.listProjectAccess(
          decodeURIComponent(membersMatch[1]!),
          user.id,
        );
        return users
          ? json(response, 200, { users })
          : json(response, 403, { error: 'Project owner access required' });
      }
      const memberMatch = /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/.exec(url.pathname);
      if ((request.method === 'PUT' || request.method === 'DELETE') && memberMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const projectId = decodeURIComponent(memberMatch[1]!);
        const memberId = decodeURIComponent(memberMatch[2]!);
        if (request.method === 'DELETE') {
          const removed = options.database.removeProjectMember(projectId, user.id, memberId);
          return removed
            ? json(response, 200, { ok: true })
            : json(response, 403, { error: 'Project owner access required' });
        }
        const input = await body(request);
        if (input.role !== 'editor' && input.role !== 'viewer')
          return json(response, 400, { error: 'role must be editor or viewer' });
        const updated = options.database.setProjectMemberRole(
          projectId,
          user.id,
          memberId,
          input.role,
        );
        return updated
          ? json(response, 200, { ok: true })
          : json(response, 403, { error: 'Project owner access required' });
      }
      const mapsMatch = /^\/api\/projects\/([^/]+)\/maps$/.exec(url.pathname);
      if (request.method === 'POST' && mapsMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const projectId = decodeURIComponent(mapsMatch[1]!);
        const role = options.database.role(projectId, user.id);
        if (!canEdit(role)) return json(response, 403, { error: 'Editor access required' });
        const input = await body(request);
        const format = input.format;
        if (format !== 'valve-220' && format !== 'quake')
          return json(response, 400, { error: 'Unsupported map format' });
        const name = text(input.name, 'name');
        if (options.database.hasMapNamed(projectId, name))
          return json(response, 409, { error: 'A map with this name already exists' });
        const source = typeof input.source === 'string' ? input.source : emptyMap(format);
        const mapId = options.database.createMapId();
        // The cell remains unreachable unless the metadata insert succeeds. Predictable database
        // errors are checked above; for an infrastructure failure, an orphan cell is safer than a
        // visible map whose sole source authority was never initialized.
        const snapshot = await options.maps.initialize(mapId, source);
        const map = options.database.createMap({
          id: mapId,
          projectId,
          userId: user.id,
          name,
          format,
        });
        return json(response, 201, { map: { ...map, ...snapshot } });
      }
      const resourcesMatch = /^\/api\/projects\/([^/]+)\/resources$/.exec(url.pathname);
      if (request.method === 'GET' && resourcesMatch) {
        const projectId = decodeURIComponent(resourcesMatch[1]!);
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const mounts = options.database.listResourceMounts(projectId, user.id);
        return mounts
          ? json(response, 200, { mounts })
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'POST' && resourcesMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const projectId = decodeURIComponent(resourcesMatch[1]!);
        if (options.database.role(projectId, user.id) !== 'owner')
          return json(response, 403, { error: 'Owner access required' });
        if (!options.artbin)
          return json(response, 503, { error: 'Artbin integration is not configured' });
        const input = await body(request);
        const assetId = text(input.assetId, 'assetId', 256);
        const { asset } = await options.artbin.metadata(assetId);
        if (!asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256))
          return json(response, 422, { error: 'Artbin asset has no stable SHA-256' });
        const bytes = await options.artbin.content(asset.id, asset.sha256);
        await options.blobs.put(bytes);
        const mount = options.database.createResourceMount({
          projectId,
          userId: user.id,
          providerAssetId: asset.id,
          expectedSha256: asset.sha256,
          kind: asset.kind,
          displayName: asset.name,
          metadata: { mimeType: asset.mimeType, size: asset.size },
        });
        return mount
          ? json(response, 201, { mount })
          : json(response, 403, { error: 'Owner access required' });
      }
      const resourceContentMatch = /^\/api\/projects\/([^/]+)\/resources\/([^/]+)\/content$/.exec(
        url.pathname,
      );
      if (request.method === 'GET' && resourceContentMatch) {
        const projectId = decodeURIComponent(resourceContentMatch[1]!);
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const mount = options.database.resourceMount(
          projectId,
          decodeURIComponent(resourceContentMatch[2]!),
          user.id,
        );
        if (!mount) return json(response, 404, { error: 'Resource not found' });
        const bytes = await options.blobs.get(mount.expectedSha256);
        if (!bytes) return json(response, 503, { error: 'Pinned resource cache is unavailable' });
        response.writeHead(200, {
          'Content-Type':
            typeof mount.metadata.mimeType === 'string'
              ? mount.metadata.mimeType
              : 'application/octet-stream',
          'Content-Length': bytes.byteLength,
          'Cache-Control': 'private, max-age=31536000, immutable',
          ETag: `"${mount.expectedSha256}"`,
        });
        return response.end(bytes);
      }
      const mapMatch = /^\/api\/maps\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && mapMatch) {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const principal = mapPrincipal(options.database, decodeURIComponent(mapMatch[1]!), user);
        if (!principal) return json(response, 404, { error: 'Map not found' });
        const snapshot = await options.maps.snapshot(principal.map.id);
        return json(response, 200, {
          map: {
            ...principal.map,
            ...snapshot,
            actorId: principal.actorId,
            displayName: principal.displayName,
          },
        });
      }
      const checkpointMatch = /^\/api\/maps\/([^/]+)\/checkpoints$/.exec(url.pathname);
      if (request.method === 'POST' && checkpointMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const input = await body(request);
        const mapId = decodeURIComponent(checkpointMatch[1]!);
        const map = options.database.map(mapId, user.id);
        if (!map || !canEdit(map.role))
          return json(response, 403, { error: 'Editor access required' });
        const checkpoint = await options.maps.createCheckpoint(
          mapId,
          text(input.name, 'name'),
          user.id,
        );
        return json(response, 201, { checkpoint });
      }
      const ticketMatch = /^\/api\/maps\/([^/]+)\/realtime-ticket$/.exec(url.pathname);
      if (request.method === 'POST' && ticketMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const principal = mapPrincipal(options.database, decodeURIComponent(ticketMatch[1]!), user);
        if (!principal) return json(response, 404, { error: 'Map not found' });
        const expiresAt = Date.now() + 60_000;
        return json(response, 201, {
          ticket: signRealtimeTicket(
            {
              version: 2,
              mapId: principal.map.id,
              principalId: principal.principalId,
              actorId: principal.actorId,
              role: principal.map.role,
              expiresAt,
            },
            options.realtimeTicketSecret,
          ),
          expiresAt,
          actorId: principal.actorId,
          displayName: principal.displayName,
        });
      }
      const buildsMatch = /^\/api\/maps\/([^/]+)\/builds$/.exec(url.pathname);
      if (request.method === 'GET' && buildsMatch) {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const mapId = decodeURIComponent(buildsMatch[1]!);
        const map = options.database.map(mapId, user.id);
        if (!map) return json(response, 404, { error: 'Map not found' });
        return json(response, 200, {
          builds: options.database.listBuilds(mapId, user.id),
          capability: options.builds?.supports(map.game) ? { profileId: 'default' } : null,
        });
      }
      if (request.method === 'POST' && buildsMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        if (!options.builds)
          return json(response, 503, { error: 'Remote builds are not configured' });
        const map = options.database.map(decodeURIComponent(buildsMatch[1]!), user.id);
        if (!map || !canEdit(map.role))
          return json(response, 403, { error: 'Editor access required' });
        if (!options.builds.supports(map.game))
          return json(response, 503, { error: `No ${map.game} build worker is configured` });
        const input = await body(request);
        const quality = input.quality === 'final' ? 'final' : 'preview';
        const snapshot = await options.maps.snapshot(map.id);
        if (
          typeof input.expectedMapVersion === 'number' &&
          input.expectedMapVersion !== snapshot.mapVersion
        )
          return json(response, 409, {
            error: 'The hosted map has not saved this revision yet; wait a moment and try again',
          });
        const source = new TextEncoder().encode(snapshot.source);
        if (source.byteLength > MAX_HOSTED_MAP_BYTES)
          return json(response, 413, { error: 'Hosted builds are limited to 2 MiB map sources' });
        const admission = options.database.buildAdmission(user.id);
        if (admission !== 'allowed') {
          response.setHeader('Retry-After', admission === 'user-hourly' ? '3600' : '30');
          return json(response, 429, {
            error:
              admission === 'user-active'
                ? 'Wait for your current build to finish'
                : admission === 'user-hourly'
                  ? 'Build limit reached; try again later'
                  : 'The build worker is at capacity',
          });
        }
        const build = options.database.createBuild({
          mapId: map.id,
          userId: user.id,
          mapVersion: snapshot.mapVersion,
          profileId: 'default',
          quality,
        });
        const queued = options.builds.enqueue({
          id: build.id,
          game: map.game,
          mapName: map.name,
          source: snapshot.source,
          mapVersion: snapshot.mapVersion,
          sourceSha256: snapshot.sourceSha256,
          profileId: 'default',
          quality,
          assets: [],
        });
        if (!queued) {
          options.database.updateBuild(build.id, 'failed', { error: 'Build queue is full' });
          response.setHeader('Retry-After', '30');
          return json(response, 429, { error: 'The build queue is full' });
        }
        return json(response, 202, {
          build: { ...build, status: 'queued', mapVersion: snapshot.mapVersion, quality },
        });
      }
      const artifactMatch =
        /^\/api\/maps\/([^/]+)\/builds\/([^/]+)\/artifacts\/([a-f0-9]{64})$/.exec(url.pathname);
      if (request.method === 'GET' && artifactMatch) {
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const build = options.database.build(
          decodeURIComponent(artifactMatch[1]!),
          decodeURIComponent(artifactMatch[2]!),
          user.id,
        );
        const artifact = build?.result?.artifacts?.find(
          ({ sha256 }) => sha256 === artifactMatch[3],
        );
        if (!artifact) return json(response, 404, { error: 'Build artifact not found' });
        const bytes = await options.blobs.get(artifact.sha256);
        if (!bytes) return json(response, 404, { error: 'Build artifact data not found' });
        response.writeHead(200, {
          'Content-Type': artifact.mediaType,
          'Content-Length': bytes.byteLength,
          'Cache-Control': 'private, max-age=31536000, immutable',
        });
        response.end(bytes);
        return;
      }
      if (
        options.staticRoot &&
        request.method === 'GET' &&
        (await staticResponse(url.pathname, options.staticRoot, response))
      )
        return;
      return json(response, 404, { error: 'Not found' });
    } catch (error) {
      const status =
        typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
          ? error.status
          : 500;
      if (status >= 500)
        console.error(
          JSON.stringify({
            message: 'Worldview service request failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      if (!response.headersSent)
        json(response, status, {
          error:
            status >= 500
              ? 'Internal server error'
              : error instanceof Error
                ? error.message
                : String(error),
        });
      else response.destroy();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  return server;
}

function environment(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataRoot = environment('WORLDVIEW_DATA_ROOT', './data/worldview');
  mkdirSync(dataRoot, { recursive: true });
  const database = new WorldviewDatabase(join(dataRoot, 'worldview.db'));
  const blobs = new FileBlobStore(join(dataRoot, 'blobs'));
  const buildEndpoints = {
    ...(process.env.WORLDVIEW_QUAKE_COMPILER_URL
      ? { quake: process.env.WORLDVIEW_QUAKE_COMPILER_URL }
      : {}),
    ...(process.env.WORLDVIEW_GOLDSRC_COMPILER_URL
      ? { goldsrc: process.env.WORLDVIEW_GOLDSRC_COMPILER_URL }
      : {}),
  };
  const service = createWorldviewService({
    database,
    blobs,
    oauth: {
      fourmUrl: environment('FOURM_URL', 'http://127.0.0.1:8000'),
      clientId: environment('FOURM_CLIENT_ID', 'worldview'),
      publicUrl: environment('WORLDVIEW_URL', 'http://localhost:8789'),
    },
    staticRoot: environment('WORLDVIEW_STATIC_ROOT', '../editor/dist'),
    realtimeTicketSecret: environment(
      'WORLDVIEW_REALTIME_TICKET_SECRET',
      'development-only-worldview-ticket-secret',
    ),
    maps: new MapCellClient(
      environment('WORLDVIEW_MAP_SERVICE_URL', 'http://127.0.0.1:8788'),
      environment('WORLDVIEW_REALTIME_TICKET_SECRET', 'development-only-worldview-ticket-secret'),
    ),
    ...(process.env.ARTBIN_URL &&
    process.env.FOURM_SERVICE_CLIENT_ID &&
    process.env.FOURM_SERVICE_CLIENT_SECRET
      ? {
          artbin: new ArtbinClient({
            url: process.env.ARTBIN_URL,
            fourmUrl: environment('FOURM_URL', 'http://127.0.0.1:8000'),
            clientId: process.env.FOURM_SERVICE_CLIENT_ID,
            clientSecret: process.env.FOURM_SERVICE_CLIENT_SECRET,
          }),
        }
      : {}),
    ...(Object.keys(buildEndpoints).length
      ? { builds: new RemoteBuildQueue(database, blobs, buildEndpoints) }
      : {}),
  });
  const port = Number(process.env.PORT ?? 8789);
  service.listen(port, '0.0.0.0', () => console.log(`Worldview service listening on ${port}`));
}
