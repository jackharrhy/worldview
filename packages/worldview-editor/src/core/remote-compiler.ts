import type {
  MapCompileArtifact,
  MapCompileDiagnostic,
  MapCompileRequest,
  MapCompileResult,
  MapCompiler,
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
}

interface RemoteResponse {
  readonly sourceDocumentRevision: number;
  readonly diagnostics: readonly MapCompileDiagnostic[];
  readonly artifacts: readonly RemoteArtifact[];
  readonly elapsedMilliseconds: number;
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

function remoteResponse(value: unknown): RemoteResponse {
  if (!value || typeof value !== 'object') throw new Error('Compiler returned a non-object result');
  const candidate = value as Partial<RemoteResponse>;
  if (
    !Number.isInteger(candidate.sourceDocumentRevision) ||
    !Number.isFinite(candidate.elapsedMilliseconds) ||
    !Array.isArray(candidate.diagnostics) ||
    !Array.isArray(candidate.artifacts)
  ) {
    throw new Error('Compiler returned an invalid result envelope');
  }
  return candidate as RemoteResponse;
}

export class RemoteMapCompiler implements MapCompiler {
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
      };
    });
    return {
      backend: this.backend,
      sourceDocumentRevision: payload.sourceDocumentRevision,
      diagnostics: payload.diagnostics,
      artifacts,
      elapsedMilliseconds: payload.elapsedMilliseconds,
    };
  }
}
