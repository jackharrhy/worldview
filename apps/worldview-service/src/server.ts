import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ArtbinClient } from './artbin.js';
import { FileBlobStore } from './blob-store.js';
import { RemoteBuildQueue } from './build-queue.js';
import { WorldviewDatabase } from './database.js';
import { MapCellClient } from './map-cell-client.js';
import { createServiceRoutes } from './routes/index.js';
import { handleRequestError, sendError, type ServiceRequestContext } from './service-http.js';
import { dispatchRoutes } from './service-routing.js';
import type { WorldviewServiceOptions } from './service-options.js';
import { serveStaticFile } from './static-files.js';

export type { HostedMapStore, WorldviewServiceOptions } from './service-options.js';

function configuredOrigin(value: string): string {
  const url = new URL(value);
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Invalid Worldview public origin: ${value}`);
  }
  return url.origin;
}

export function createWorldviewService(options: WorldviewServiceOptions) {
  const primaryPublicOrigin = configuredOrigin(options.oauth.publicUrl);
  const publicOriginsByHost = new Map(
    [primaryPublicOrigin, ...(options.additionalPublicOrigins ?? [])].map((value) => {
      const origin = configuredOrigin(value);
      return [new URL(origin).host, origin];
    }),
  );
  const routes = createServiceRoutes(options);
  const server = createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
    try {
      const publicOrigin =
        publicOriginsByHost.get(request.headers.host?.toLowerCase() ?? '') ?? primaryPublicOrigin;
      const context: ServiceRequestContext = {
        request,
        response,
        url: new URL(request.url ?? '/', publicOrigin),
        publicOrigin,
        secureCookies: new URL(publicOrigin).protocol === 'https:',
      };
      if (await dispatchRoutes(routes, context)) return;
      if (
        options.staticRoot &&
        request.method === 'GET' &&
        (await serveStaticFile(context.url.pathname, options.staticRoot, response))
      ) {
        return;
      }
      sendError(response, 404, 'Not found');
    } catch (error) {
      handleRequestError(response, error);
    }
  });
  server.requestTimeout = 10 * 60_000;
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
    additionalPublicOrigins: (process.env.WORLDVIEW_ADDITIONAL_PUBLIC_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    oauth: {
      fourmUrl: environment('FOURM_URL', 'http://127.0.0.1:8000'),
      clientId: environment('FOURM_CLIENT_ID', 'worldview'),
      publicUrl: environment('WORLDVIEW_URL', 'http://localhost:8789'),
    },
    ...(process.env.WORLDVIEW_4ORM_INTROSPECTION_SECRET
      ? {
          mcpAuth: {
            fourmUrl: environment('FOURM_URL', 'http://127.0.0.1:8000'),
            publicUrl: environment('WORLDVIEW_URL', 'http://localhost:8789'),
            clientId: environment('WORLDVIEW_4ORM_INTROSPECTION_CLIENT_ID', 'worldview-server'),
            clientSecret: process.env.WORLDVIEW_4ORM_INTROSPECTION_SECRET,
          },
        }
      : {}),
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
