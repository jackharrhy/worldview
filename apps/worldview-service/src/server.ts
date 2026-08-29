import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileBlobStore, type BlobStore } from './blob-store.js';
import { WorldviewDatabase, type WorldviewUser } from './database.js';
import { beginAuthorization, completeAuthorization, type OAuthConfig } from './oauth.js';
import { signRealtimeTicket } from './realtime-ticket.js';
import { ArtbinClient } from './artbin.js';
import { RemoteBuildQueue } from './build-queue.js';

const SESSION_COOKIE = 'worldview_session';
const OAUTH_COOKIE = 'worldview_oauth';
const GUEST_COOKIE = 'worldview_guest';

export interface WorldviewServiceOptions {
  readonly database: WorldviewDatabase;
  readonly blobs: BlobStore;
  readonly oauth: OAuthConfig;
  readonly staticRoot?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly realtimeTicketSecret: string;
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
  response.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure ? '; Secure' : ''}`,
  );
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

function mapPrincipal(request: IncomingMessage, database: WorldviewDatabase, mapId: string) {
  const user = userFor(request, database);
  if (user) {
    const map = database.map(mapId, user.id);
    return map
      ? { map, actorId: user.id, displayName: user.displayName, principalId: user.id, user }
      : null;
  }
  const access = database.guestAccess(cookie(request, GUEST_COOKIE), mapId);
  if (!access) return null;
  const map = database.mapForGuest(mapId, access);
  return map
    ? {
        map,
        actorId: access.actorId,
        displayName: access.displayName,
        principalId: `guest:${access.shareId}`,
        access,
      }
    : null;
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
  return createServer(async (request, response) => {
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
        const error = url.searchParams.get('error');
        if (error) return redirect(response, `/?authError=${encodeURIComponent(error)}`);
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        if (!state || !code)
          return json(response, 400, { error: 'OAuth code and state are required' });
        const completed = await completeAuthorization({
          database: options.database,
          config: options.oauth,
          state,
          code,
          cookieState: cookie(request, OAUTH_COOKIE),
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
      if (request.method === 'POST' && url.pathname === '/api/guest-sessions') {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const input = await body(request);
        const result = options.database.exchangeShare(
          text(input.token, 'token', 256),
          text(input.displayName ?? 'Guest mapper', 'displayName', 48),
        );
        if (!result)
          return json(response, 404, { error: 'Share link is invalid, expired, or revoked' });
        setCookie(
          response,
          GUEST_COOKIE,
          result.token,
          (result.expiresAt - Date.now()) / 1000,
          secure,
        );
        return json(response, 201, { ok: true });
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
      const mapsMatch = /^\/api\/projects\/([^/]+)\/maps$/.exec(url.pathname);
      if (request.method === 'POST' && mapsMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const projectId = decodeURIComponent(mapsMatch[1]!);
        const role = options.database.role(projectId, user.id);
        if (role !== 'owner' && role !== 'editor' && !user.isAdmin)
          return json(response, 403, { error: 'Editor access required' });
        const input = await body(request);
        const format = input.format;
        if (format !== 'valve-220' && format !== 'quake')
          return json(response, 400, { error: 'Unsupported map format' });
        const source = typeof input.source === 'string' ? input.source : emptyMap(format);
        const bytes = new TextEncoder().encode(source);
        const blob = await options.blobs.put(bytes);
        const fingerprint = createHash('sha256').update(bytes).digest('hex');
        const map = options.database.createMap({
          projectId,
          userId: user.id,
          name: text(input.name, 'name'),
          format,
          sourceHash: blob.sha256,
          sourceFingerprint: fingerprint,
        });
        return json(response, 201, { map });
      }
      const resourcesMatch = /^\/api\/projects\/([^/]+)\/resources$/.exec(url.pathname);
      if (request.method === 'GET' && resourcesMatch) {
        const projectId = decodeURIComponent(resourcesMatch[1]!);
        const user = userFor(request, options.database);
        const guestMapId = url.searchParams.get('mapId');
        const guest =
          !user && guestMapId ? mapPrincipal(request, options.database, guestMapId) : null;
        if (!user && (!guest || guest.map.projectId !== projectId))
          return json(response, 401, { error: 'Authentication required' });
        const mounts = user
          ? options.database.listResourceMounts(projectId, user.id)
          : options.database.listResourceMountsForProject(projectId);
        return mounts
          ? json(response, 200, { mounts })
          : json(response, 404, { error: 'Project not found' });
      }
      if (request.method === 'POST' && resourcesMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
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
          projectId: decodeURIComponent(resourcesMatch[1]!),
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
        const user = userFor(request, options.database);
        const guestMapId = url.searchParams.get('mapId');
        const guest =
          !user && guestMapId ? mapPrincipal(request, options.database, guestMapId) : null;
        if (!user && (!guest || guest.map.projectId !== projectId))
          return json(response, 401, { error: 'Authentication required' });
        const mount = user
          ? options.database.resourceMount(
              projectId,
              decodeURIComponent(resourceContentMatch[2]!),
              user.id,
            )
          : options.database.resourceMountForProject(
              projectId,
              decodeURIComponent(resourceContentMatch[2]!),
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
        const principal = mapPrincipal(request, options.database, decodeURIComponent(mapMatch[1]!));
        if (!principal)
          return json(response, 404, { error: 'Map not found or authentication required' });
        const source = await options.blobs.get(principal.map.sourceHash);
        if (!source) return json(response, 500, { error: 'Map source blob is missing' });
        return json(response, 200, {
          map: {
            ...principal.map,
            source: new TextDecoder().decode(source),
            actorId: principal.actorId,
            displayName: principal.displayName,
          },
        });
      }
      if (request.method === 'PUT' && mapMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const mapId = decodeURIComponent(mapMatch[1]!);
        const principal = mapPrincipal(request, options.database, mapId);
        if (!principal)
          return json(response, 404, { error: 'Map not found or authentication required' });
        const input = await body(request, 16 * 1024 * 1024);
        if (
          typeof input.source !== 'string' ||
          !Number.isSafeInteger(input.expectedVersion) ||
          (input.expectedVersion as number) < 0
        ) {
          return json(response, 400, { error: 'source and expectedVersion are required' });
        }
        const bytes = new TextEncoder().encode(input.source);
        const blob = await options.blobs.put(bytes);
        const saveInput = {
          mapId,
          expectedVersion: input.expectedVersion as number,
          sourceHash: blob.sha256,
          sourceFingerprint: createHash('sha256').update(bytes).digest('hex'),
        };
        const version =
          'user' in principal
            ? options.database.saveMapSource({ ...saveInput, userId: principal.user.id })
            : options.database.saveGuestMapSource({ ...saveInput, access: principal.access });
        return version === null
          ? json(response, 409, { error: 'The hosted map changed; reload before overwriting it' })
          : json(response, 200, { sourceVersion: version, sha256: blob.sha256 });
      }
      const checkpointMatch = /^\/api\/maps\/([^/]+)\/checkpoints$/.exec(url.pathname);
      if (request.method === 'POST' && checkpointMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const input = await body(request);
        const checkpoint = options.database.createCheckpoint({
          mapId: decodeURIComponent(checkpointMatch[1]!),
          userId: user.id,
          name: text(input.name, 'name'),
        });
        return checkpoint
          ? json(response, 201, { checkpoint })
          : json(response, 403, { error: 'Editor access required' });
      }
      const ticketMatch = /^\/api\/maps\/([^/]+)\/realtime-ticket$/.exec(url.pathname);
      if (request.method === 'POST' && ticketMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const principal = mapPrincipal(
          request,
          options.database,
          decodeURIComponent(ticketMatch[1]!),
        );
        if (!principal)
          return json(response, 404, { error: 'Map not found or authentication required' });
        const expiresAt = Date.now() + 60_000;
        return json(response, 201, {
          ticket: signRealtimeTicket(
            {
              version: 1,
              mapId: principal.map.id,
              roomId: principal.map.roomId,
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
        const builds = options.database.listBuilds(decodeURIComponent(buildsMatch[1]!), user.id);
        return builds
          ? json(response, 200, { builds })
          : json(response, 404, { error: 'Map not found' });
      }
      if (request.method === 'POST' && buildsMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        if (!options.builds)
          return json(response, 503, { error: 'Remote builds are not configured' });
        const map = options.database.map(decodeURIComponent(buildsMatch[1]!), user.id);
        if (!map || map.role === 'viewer')
          return json(response, 403, { error: 'Editor access required' });
        const input = await body(request);
        const quality = input.quality === 'final' ? 'final' : 'preview';
        const source = await options.blobs.get(map.sourceHash);
        if (!source) return json(response, 500, { error: 'Map source blob is missing' });
        const build = options.database.createBuild({
          mapId: map.id,
          userId: user.id,
          sourceVersion: map.sourceVersion,
          profileId: 'default',
          quality,
        });
        options.builds.enqueue({
          id: build.id,
          game: map.game,
          mapName: map.name,
          source: new TextDecoder().decode(source),
          sourceVersion: map.sourceVersion,
          sourceSha256: map.sourceHash,
          profileId: 'default',
          quality,
          assets: [],
        });
        return json(response, 202, {
          build: { ...build, status: 'queued', sourceVersion: map.sourceVersion, quality },
        });
      }
      const shareMatch = /^\/api\/projects\/([^/]+)\/shares$/.exec(url.pathname);
      if (request.method === 'POST' && shareMatch) {
        if (!mutationAllowed(request, options.oauth.publicUrl))
          return json(response, 403, { error: 'Cross-origin mutation rejected' });
        const user = requireUser(request, response, options.database);
        if (!user) return;
        const projectId = decodeURIComponent(shareMatch[1]!);
        if (options.database.role(projectId, user.id) !== 'owner' && !user.isAdmin)
          return json(response, 403, { error: 'Owner access required' });
        const input = await body(request);
        if (input.role !== 'editor' && input.role !== 'viewer')
          return json(response, 400, { error: 'Invalid share role' });
        const share = options.database.createShare({
          projectId,
          userId: user.id,
          role: input.role,
          ...(typeof input.mapId === 'string' ? { mapId: input.mapId } : {}),
          ...(typeof input.expiresAt === 'number' ? { expiresAt: input.expiresAt } : {}),
        });
        return json(response, 201, { share });
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
