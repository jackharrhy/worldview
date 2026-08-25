import type { NativeCompilerRequest, NativeCompilerResult } from './compiler.js';
import type { LaunchableBuild, NativeLaunchConfig } from './launch.js';

export interface NativeLaunchRequest {
  readonly buildId: string;
  readonly profileId: string;
  readonly expectedDocumentRevision: number;
}

export function originAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return origin === undefined || allowedOrigins.has(origin);
}

export function parseCompileRequest(value: unknown): NativeCompilerRequest {
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
  return {
    mapName: request.mapName,
    mapText: request.mapText,
    quality: request.quality,
    expectedDocumentRevision: Number(request.expectedDocumentRevision),
    ...(request.profileId ? { profileId: request.profileId } : {}),
    ...(request.assets ? { assets: request.assets } : {}),
  };
}

export function parseLaunchRequest(value: unknown): NativeLaunchRequest {
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
  return {
    buildId: request.buildId,
    profileId: request.profileId,
    expectedDocumentRevision: Number(request.expectedDocumentRevision),
  };
}

export function helperCapabilities(
  compilerConfigured: boolean,
  game: 'quake' | 'goldsrc',
  launchProfile: NativeLaunchConfig | null,
) {
  return {
    protocolVersion: 1 as const,
    compileProfiles: compilerConfigured
      ? [
          {
            id: 'default',
            label: 'Local ericw-tools',
            game,
            qualities: ['preview', 'final'] as const,
          },
        ]
      : [],
    launchProfiles: launchProfile
      ? [
          {
            id: launchProfile.profileId,
            label: launchProfile.label,
            game: launchProfile.game,
          },
        ]
      : [],
  };
}

export class BoundedBuildHistory {
  private readonly builds = new Map<string, LaunchableBuild>();

  public constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Build history limit must be a positive integer');
    }
  }

  public remember(request: NativeCompilerRequest, result: NativeCompilerResult): void {
    if (result.status !== 'succeeded') return;
    const bsp = result.artifacts.find((artifact) => artifact.kind === 'bsp');
    if (!bsp) return;
    this.builds.set(result.buildId, {
      buildId: result.buildId,
      mapName: request.mapName,
      sourceDocumentRevision: result.sourceDocumentRevision,
      bspBase64: bsp.base64,
    });
    while (this.builds.size > this.limit) {
      const oldest = this.builds.keys().next().value as string | undefined;
      if (!oldest) break;
      this.builds.delete(oldest);
    }
  }

  public get(buildId: string): LaunchableBuild | undefined {
    return this.builds.get(buildId);
  }
}
