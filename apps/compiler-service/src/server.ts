import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import {
  compileNativeMap,
  NativeCompileError,
  type NativeCompilerConfig,
  type NativeCompilerRequest,
} from './compiler.js';

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

let activeCompiles = 0;

function compilerConfigured(): boolean {
  return Boolean(config.qbsp && config.vis && config.light);
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
    const result = await compileNativeMap(
      compileRequest(await readJson(request)),
      config,
      controller.signal,
    );
    json(response, 200, result);
  } catch (error) {
    if (controller.signal.aborted) return;
    const native = error instanceof NativeCompileError ? error : null;
    json(response, native ? 422 : 400, {
      error: error instanceof Error ? error.message : String(error),
      ...(native ? { stage: native.stage, output: native.output } : {}),
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
