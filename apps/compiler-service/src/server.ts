import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  compileNativeMap,
  type NativeCompilerConfig,
  type NativeCompilerRequest,
} from './compiler.js';
import { configuredLaunchProfile, launchBuild, type LaunchableBuild } from './launch.js';

const host = process.env.WORLDVIEW_COMPILER_HOST ?? '127.0.0.1';
const port = Number(process.env.WORLDVIEW_COMPILER_PORT ?? 8788);
const maxRequestBytes = Number(
  process.env.WORLDVIEW_COMPILER_MAX_REQUEST_BYTES ?? 96 * 1024 * 1024,
);
const maxConcurrent = Number(process.env.WORLDVIEW_COMPILER_MAX_CONCURRENT ?? 2);
const allowedOrigins = new Set(
  (process.env.WORLDVIEW_COMPILER_ORIGINS ?? 'http://127.0.0.1:5174,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const config: NativeCompilerConfig = {
  qbsp: process.env.ERICW_QBSP ?? '',
  vis: process.env.ERICW_VIS ?? '',
  light: process.env.ERICW_LIGHT ?? '',
  ...(process.env.WORLDVIEW_GAME_DIR ? { gameDirectory: process.env.WORLDVIEW_GAME_DIR } : {}),
  maxThreads: Math.max(1, Number(process.env.WORLDVIEW_COMPILER_THREADS ?? 2)),
  timeoutMilliseconds: Math.max(
    1000,
    Number(process.env.WORLDVIEW_COMPILER_TIMEOUT_MS ?? 5 * 60 * 1000),
  ),
  maxLogBytes: Math.max(1024, Number(process.env.WORLDVIEW_COMPILER_MAX_LOG_BYTES ?? 512 * 1024)),
};
const gameProfile = process.env.WORLDVIEW_GAME_PROFILE === 'goldsrc' ? 'goldsrc' : 'quake';
const launchProfile = configuredLaunchProfile(process.env);
const buildHistory = new Map<string, LaunchableBuild>();
const maxBuildHistory = Math.max(1, Number(process.env.WORLDVIEW_COMPILER_HISTORY ?? 20));

let activeCompiles = 0;

function compilerConfigured(): boolean {
  return Boolean(config.qbsp && config.vis && config.light);
}

function rememberBuild(
  request: NativeCompilerRequest,
  result: Awaited<ReturnType<typeof compileNativeMap>>,
): void {
  if (result.status !== 'succeeded') return;
  const bsp = result.artifacts.find((artifact) => artifact.kind === 'bsp');
  if (!bsp) return;
  buildHistory.set(result.buildId, {
    buildId: result.buildId,
    mapName: request.mapName,
    sourceDocumentRevision: result.sourceDocumentRevision,
    bspBase64: bsp.base64,
  });
  while (buildHistory.size > maxBuildHistory) {
    const oldest = buildHistory.keys().next().value as string | undefined;
    if (!oldest) break;
    buildHistory.delete(oldest);
  }
}

function cors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.has(origin)) return false;
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'origin');
  return true;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0);
  if (declared > maxRequestBytes) throw new Error('Request body is too large');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.byteLength;
    if (length > maxRequestBytes) throw new Error('Request body is too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function compileRequest(value: unknown): NativeCompilerRequest {
  if (!value || typeof value !== 'object') throw new Error('Request must be a JSON object');
  const request = value as Partial<NativeCompilerRequest>;
  if (
    typeof request.mapName !== 'string' ||
    typeof request.mapText !== 'string' ||
    (request.quality !== 'preview' && request.quality !== 'final') ||
    !Number.isInteger(request.expectedDocumentRevision) ||
    request.expectedDocumentRevision! < 0
  ) {
    throw new Error('Request contains invalid compile fields');
  }
  if (request.profileId !== undefined && request.profileId !== 'default') {
    throw new Error('Unknown compile profile');
  }
  if (
    request.assets !== undefined &&
    (!Array.isArray(request.assets) ||
      request.assets.some(
        (asset) =>
          !asset ||
          typeof asset.name !== 'string' ||
          typeof asset.mediaType !== 'string' ||
          typeof asset.base64 !== 'string',
      ))
  ) {
    throw new Error('Request contains invalid compile assets');
  }
  return request as NativeCompilerRequest;
}

function launchRequest(value: unknown): {
  readonly buildId: string;
  readonly profileId: string;
  readonly expectedDocumentRevision: number;
} {
  if (!value || typeof value !== 'object') throw new Error('Request must be a JSON object');
  const request = value as Record<string, unknown>;
  if (
    typeof request.buildId !== 'string' ||
    typeof request.profileId !== 'string' ||
    !Number.isInteger(request.expectedDocumentRevision) ||
    Number(request.expectedDocumentRevision) < 0
  ) {
    throw new Error('Request contains invalid launch fields');
  }
  return request as ReturnType<typeof launchRequest>;
}

const server = createServer(async (request, response) => {
  if (!cors(request, response)) {
    json(response, 403, { error: 'Origin is not allowed' });
    return;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    });
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    json(response, compilerConfigured() ? 200 : 503, {
      status: compilerConfigured() ? 'ready' : 'unconfigured',
      activeCompiles,
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/capabilities') {
    json(response, 200, {
      protocolVersion: 1,
      compileProfiles: compilerConfigured()
        ? [
            {
              id: 'default',
              label: 'Local ericw-tools',
              game: gameProfile,
              qualities: ['preview', 'final'],
            },
          ]
        : [],
      launchProfiles: launchProfile
        ? [{ id: launchProfile.profileId, label: launchProfile.label, game: launchProfile.game }]
        : [],
    });
    return;
  }
  if (request.method === 'POST' && request.url === '/launch') {
    if (!launchProfile) {
      json(response, 503, { error: 'No external launch profile is configured' });
      return;
    }
    try {
      const requested = launchRequest(await readJson(request));
      if (requested.profileId !== launchProfile.profileId) {
        json(response, 400, { error: 'Unknown launch profile' });
        return;
      }
      const build = buildHistory.get(requested.buildId);
      if (!build) {
        json(response, 404, { error: 'Build is unavailable or expired' });
        return;
      }
      if (build.sourceDocumentRevision !== requested.expectedDocumentRevision) {
        json(response, 409, { error: 'Build revision does not match the requested revision' });
        return;
      }
      json(response, 200, await launchBuild(build, launchProfile));
    } catch (error) {
      json(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (request.method !== 'POST' || request.url !== '/compile') {
    json(response, 404, { error: 'Not found' });
    return;
  }
  if (!compilerConfigured()) {
    json(response, 503, { error: 'ERICW_QBSP, ERICW_VIS, and ERICW_LIGHT must be configured' });
    return;
  }
  if (activeCompiles >= maxConcurrent) {
    json(response, 429, { error: 'Compiler concurrency limit reached' });
    return;
  }

  const controller = new AbortController();
  request.once('aborted', () => controller.abort());
  activeCompiles += 1;
  try {
    const requested = compileRequest(await readJson(request));
    const result = await compileNativeMap(requested, config, controller.signal);
    rememberBuild(requested, result);
    json(response, 200, result);
  } catch (error) {
    if (controller.signal.aborted) return;
    json(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    activeCompiles -= 1;
  }
});

server.listen(port, host, () => {
  const state = compilerConfigured() ? 'ready' : 'unconfigured';
  process.stdout.write(
    `Worldview compiler service (${state}) listening on http://${host}:${port}\n`,
  );
});
