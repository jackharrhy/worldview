import type {
  MapCompileArtifact,
  MapCompileDiagnostic,
  MapCompileRequest,
  MapCompileResult,
  MapCompiler,
  MapBuildCapabilities,
  MapBuildService,
  MapLaunchRequest,
  MapLaunchResult,
} from './compiler.js';

export type CompilerFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface RemoteMapCompilerOptions {
  readonly endpoint: string | URL;
  readonly fetch?: CompilerFetch;
  readonly headers?: Readonly<Record<string, string>>;
  readonly maxInputAssetBytes?: number;
  readonly maxArtifactBytes?: number;
}

interface RemoteArtifact {
  readonly name: string;
  readonly mediaType: string;
  readonly base64: string;
  readonly kind: MapCompileArtifact['kind'];
  readonly stage?: string;
}

interface RemoteResponse {
  readonly status: MapCompileResult['status'];
  readonly buildId: string;
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly MapCompileDiagnostic[];
  readonly artifacts: readonly RemoteArtifact[];
  readonly elapsedMilliseconds: number;
  readonly logs: MapCompileResult['logs'];
}

function decodeBase64(value: string, limit: number): ArrayBuffer {
  const estimatedBytes = Math.floor((value.length * 3) / 4);
  if (estimatedBytes > limit) throw new Error(`Compiler artifact exceeds the ${limit}-byte limit`);
  const decoded = atob(value);
  if (decoded.length > limit) throw new Error(`Compiler artifact exceeds the ${limit}-byte limit`);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes.buffer;
}

function encodeBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const chunks: string[] = [];
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

function validGame(value: unknown): value is 'quake' | 'goldsrc' {
  return value === 'quake' || value === 'goldsrc';
}

function remoteResponse(value: unknown): RemoteResponse {
  if (!value || typeof value !== 'object') throw new Error('Compiler returned a non-object result');
  const candidate = value as Partial<RemoteResponse>;
  if (
    !Number.isInteger(candidate.sourceDocumentRevision) ||
    (candidate.status !== 'succeeded' && candidate.status !== 'failed') ||
    typeof candidate.buildId !== 'string' ||
    !Number.isFinite(candidate.elapsedMilliseconds) ||
    !Array.isArray(candidate.diagnostics) ||
    !Array.isArray(candidate.artifacts) ||
    !Array.isArray(candidate.logs)
  ) {
    throw new Error('Compiler returned an invalid result envelope');
  }
  const artifactKinds = new Set<MapCompileArtifact['kind']>([
    'bsp',
    'portal',
    'leak-path',
    'log',
    'other',
  ]);
  if (
    candidate.diagnostics.some(
      (diagnostic) =>
        !diagnostic ||
        !['info', 'warning', 'error'].includes(diagnostic.severity) ||
        typeof diagnostic.stage !== 'string' ||
        typeof diagnostic.message !== 'string',
    ) ||
    candidate.logs.some(
      (log) =>
        !log ||
        typeof log.stage !== 'string' ||
        typeof log.text !== 'string' ||
        typeof log.truncated !== 'boolean',
    ) ||
    candidate.artifacts.some(
      (artifact) =>
        !artifact ||
        typeof artifact.name !== 'string' ||
        typeof artifact.mediaType !== 'string' ||
        typeof artifact.base64 !== 'string' ||
        !artifactKinds.has(artifact.kind),
    )
  ) {
    throw new Error('Compiler returned invalid diagnostics, logs, or artifacts');
  }
  return candidate as RemoteResponse;
}

function buildCapabilities(value: unknown): MapBuildCapabilities {
  if (!value || typeof value !== 'object') throw new Error('Helper returned invalid capabilities');
  const candidate = value as Partial<MapBuildCapabilities>;
  if (
    candidate.protocolVersion !== 1 ||
    !Array.isArray(candidate.compileProfiles) ||
    !Array.isArray(candidate.launchProfiles) ||
    candidate.compileProfiles.some(
      (profile) =>
        !profile ||
        typeof profile.id !== 'string' ||
        typeof profile.label !== 'string' ||
        !validGame(profile.game) ||
        !Array.isArray(profile.qualities) ||
        profile.qualities.some((quality: unknown) => quality !== 'preview' && quality !== 'final'),
    ) ||
    candidate.launchProfiles.some(
      (profile) =>
        !profile ||
        typeof profile.id !== 'string' ||
        typeof profile.label !== 'string' ||
        !validGame(profile.game),
    )
  ) {
    throw new Error('Helper returned invalid capabilities');
  }
  return candidate as MapBuildCapabilities;
}

function launchResult(value: unknown): MapLaunchResult {
  if (!value || typeof value !== 'object')
    throw new Error('Helper returned an invalid launch result');
  const candidate = value as Partial<MapLaunchResult>;
  if (
    typeof candidate.buildId !== 'string' ||
    typeof candidate.profileId !== 'string' ||
    !Number.isInteger(candidate.sourceDocumentRevision) ||
    !Number.isFinite(candidate.launchedAt)
  ) {
    throw new Error('Helper returned an invalid launch result');
  }
  return candidate as MapLaunchResult;
}

export class RemoteMapCompiler implements MapCompiler, MapBuildService {
  public readonly backend = 'remote' as const;
  private readonly fetchImplementation: CompilerFetch;
  private readonly maxInputAssetBytes: number;
  private readonly maxArtifactBytes: number;

  public constructor(private readonly options: RemoteMapCompilerOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxInputAssetBytes = Math.max(1, options.maxInputAssetBytes ?? 64 * 1024 * 1024);
    this.maxArtifactBytes = Math.max(1, options.maxArtifactBytes ?? 128 * 1024 * 1024);
  }

  public async compile(request: MapCompileRequest): Promise<MapCompileResult> {
    const inputBytes =
      request.assets?.reduce((total, asset) => total + asset.data.byteLength, 0) ?? 0;
    if (inputBytes > this.maxInputAssetBytes) {
      throw new Error(`Compiler inputs exceed the ${this.maxInputAssetBytes}-byte limit`);
    }
    const response = await this.fetchImplementation(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify({
        mapName: request.mapName,
        mapText: request.mapText,
        quality: request.quality,
        expectedDocumentRevision: request.expectedDocumentRevision,
        profileId: request.profileId,
        assets: request.assets?.map((asset) => ({
          name: asset.name,
          mediaType: asset.mediaType,
          base64: encodeBase64(asset.data),
        })),
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2048);
      throw new Error(
        `Compiler request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    const payload = remoteResponse(await response.json());
    const artifacts: MapCompileArtifact[] = payload.artifacts.map((artifact) => {
      if (!artifact.name || !artifact.mediaType || typeof artifact.base64 !== 'string') {
        throw new Error('Compiler returned an invalid artifact');
      }
      return {
        name: artifact.name,
        mediaType: artifact.mediaType,
        data: decodeBase64(artifact.base64, this.maxArtifactBytes),
        kind: artifact.kind,
        ...(artifact.stage ? { stage: artifact.stage } : {}),
      };
    });
    return {
      backend: this.backend,
      status: payload.status,
      buildId: payload.buildId,
      sourceDocumentRevision: payload.sourceDocumentRevision,
      diagnostics: payload.diagnostics,
      artifacts,
      logs: payload.logs,
      elapsedMilliseconds: payload.elapsedMilliseconds,
    };
  }

  public async capabilities(signal?: AbortSignal): Promise<MapBuildCapabilities> {
    const endpoint = new URL('/capabilities', this.options.endpoint);
    const response = await this.fetchImplementation(endpoint, {
      headers: { accept: 'application/json', ...this.options.headers },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok)
      throw new Error(`Build capability request failed with HTTP ${response.status}`);
    return buildCapabilities(await response.json());
  }

  public async launch(request: MapLaunchRequest): Promise<MapLaunchResult> {
    const endpoint = new URL('/launch', this.options.endpoint);
    const response = await this.fetchImplementation(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify({
        buildId: request.buildId,
        profileId: request.profileId,
        expectedDocumentRevision: request.expectedDocumentRevision,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2048);
      throw new Error(
        `Launch request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }
    return launchResult(await response.json());
  }
}
