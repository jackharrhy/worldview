import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  compileNativeMap,
  parseCompilerGameProfile,
  type NativeCompilerConfig,
} from './compiler.js';
import { configuredLaunchProfile, launchBuild } from './launch.js';
import {
  BoundedBuildHistory,
  helperCapabilities,
  originAllowed,
  parseCompileRequest,
  parseLaunchRequest,
} from './protocol.js';

const host = process.env.WORLDVIEW_COMPILER_HOST ?? '127.0.0.1';
const port = Number(process.env.WORLDVIEW_COMPILER_PORT ?? 8788);
const maxRequestBytes = Number(
  process.env.WORLDVIEW_COMPILER_MAX_REQUEST_BYTES ?? 96 * 1024 * 1024,
);
const maxConcurrent = Number(process.env.WORLDVIEW_COMPILER_MAX_CONCURRENT ?? 2);
const maxMapBytes = Number(process.env.WORLDVIEW_COMPILER_MAX_MAP_BYTES ?? 2 * 1024 * 1024);
const maxAssets = Number(process.env.WORLDVIEW_COMPILER_MAX_ASSETS ?? 16);
const maxAssetBase64Bytes = Number(
  process.env.WORLDVIEW_COMPILER_MAX_ASSET_BASE64_BYTES ?? 32 * 1024 * 1024,
);
const allowedOrigins = new Set(
  (process.env.WORLDVIEW_COMPILER_ORIGINS ?? 'http://127.0.0.1:5174,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const gameProfile = parseCompilerGameProfile(process.env.WORLDVIEW_GAME_PROFILE);
const config: NativeCompilerConfig = {
  toolchain:
    gameProfile === 'quake2'
      ? { kind: 'q2tool', executable: process.env.WORLDVIEW_Q2TOOL ?? '' }
      : {
          kind: 'ericw',
          qbsp: process.env.ERICW_QBSP ?? '',
          vis: process.env.ERICW_VIS ?? '',
          light: process.env.ERICW_LIGHT ?? '',
        },
  ...(process.env.WORLDVIEW_GAME_DIR ? { gameDirectory: process.env.WORLDVIEW_GAME_DIR } : {}),
  maxThreads: Math.max(1, Number(process.env.WORLDVIEW_COMPILER_THREADS ?? 2)),
  timeoutMilliseconds: Math.max(
    1000,
    Number(process.env.WORLDVIEW_COMPILER_TIMEOUT_MS ?? 5 * 60 * 1000),
  ),
  maxLogBytes: Math.max(1024, Number(process.env.WORLDVIEW_COMPILER_MAX_LOG_BYTES ?? 512 * 1024)),
  maxArtifactBytes: Math.max(
    1024,
    Number(process.env.WORLDVIEW_COMPILER_MAX_ARTIFACT_BYTES ?? 64 * 1024 * 1024),
  ),
};
const launchProfile = configuredLaunchProfile(process.env);
const maxBuildHistory = Math.max(1, Number(process.env.WORLDVIEW_COMPILER_HISTORY ?? 20));
const buildHistory = new BoundedBuildHistory(maxBuildHistory);

let activeCompiles = 0;

function compilerConfigured(): boolean {
  return config.toolchain.kind === 'q2tool'
    ? Boolean(config.toolchain.executable)
    : Boolean(config.toolchain.qbsp && config.toolchain.vis && config.toolchain.light);
}

function compilerConfigurationError(): string {
  return config.toolchain.kind === 'q2tool'
    ? 'WORLDVIEW_Q2TOOL must be configured for the quake2 profile'
    : 'ERICW_QBSP, ERICW_VIS, and ERICW_LIGHT must be configured';
}

function cors(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!originAllowed(origin, allowedOrigins)) return false;
  if (!origin) return true;
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

const server = createServer({ maxHeaderSize: 16 * 1024 }, async (request, response) => {
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
    json(response, 200, helperCapabilities(compilerConfigured(), gameProfile, launchProfile));
    return;
  }
  if (request.method === 'POST' && request.url === '/launch') {
    if (!launchProfile) {
      json(response, 503, { error: 'No external launch profile is configured' });
      return;
    }
    try {
      const requested = parseLaunchRequest(await readJson(request));
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
    json(response, 503, { error: compilerConfigurationError() });
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
    const requested = parseCompileRequest(await readJson(request), {
      maxMapBytes,
      maxAssets,
      maxAssetBase64Bytes,
    });
    const result = await compileNativeMap(requested, config, controller.signal);
    buildHistory.remember(requested, result);
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

server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 64;

server.listen(port, host, () => {
  const state = compilerConfigured() ? 'ready' : 'unconfigured';
  process.stdout.write(
    `Worldview compiler service (${state}) listening on http://${host}:${port}\n`,
  );
});
