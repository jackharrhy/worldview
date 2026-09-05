import type {
  MapBuildCapabilities,
  MapBuildService,
  MapCompileArtifact,
  MapCompileRequest,
  MapCompileResult,
  MapLaunchRequest,
  MapLaunchResult,
  WorldviewGameProfile,
} from '@jackharrhy/worldview-editor';
import { HostedBuildCreatedResponseSchema, HostedBuildsResponseSchema } from '@worldview/protocol';
import { decodeHostedResponse } from './hosted-api.js';

interface HostedMapBuildServiceOptions {
  readonly mapId: string;
  readonly game: WorldviewGameProfile;
  readonly fetch?: typeof globalThis.fetch;
  readonly pollIntervalMilliseconds?: number;
  readonly timeoutMilliseconds?: number;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      globalThis.clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

/** Uses the canonical hosted map snapshot; map text and assets are already owned by the server. */
export class HostedMapBuildService implements MapBuildService {
  public readonly backend = 'remote' as const;
  private readonly fetch: typeof globalThis.fetch;
  private readonly pollIntervalMilliseconds: number;
  private readonly timeoutMilliseconds: number;

  public constructor(private readonly options: HostedMapBuildServiceOptions) {
    this.fetch = (options.fetch ?? globalThis.fetch).bind(globalThis);
    this.pollIntervalMilliseconds = options.pollIntervalMilliseconds ?? 500;
    this.timeoutMilliseconds = options.timeoutMilliseconds ?? 120_000;
  }

  public async capabilities(signal?: AbortSignal): Promise<MapBuildCapabilities> {
    const response = await decodeHostedResponse(
      await this.fetch(this.endpoint(), {
        credentials: 'same-origin',
        signal: signal ?? null,
      }),
      HostedBuildsResponseSchema,
    );
    return {
      protocolVersion: 1,
      compileProfiles: response.capability
        ? [
            {
              id: response.capability.profileId,
              label: 'Worldview hosted compiler',
              game: this.options.game,
              qualities: ['preview', 'final'],
            },
          ]
        : [],
      launchProfiles: [],
    };
  }

  private endpoint(): string {
    return `/api/maps/${encodeURIComponent(this.options.mapId)}/builds`;
  }

  public async compile(request: MapCompileRequest): Promise<MapCompileResult> {
    const endpoint = this.endpoint();
    const created = await decodeHostedResponse(
      await this.fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quality: request.quality,
          expectedMapVersion: request.expectedDocumentRevision,
        }),
        signal: request.signal ?? null,
      }),
      HostedBuildCreatedResponseSchema,
    );
    const deadline = Date.now() + this.timeoutMilliseconds;
    let build = created.build;
    while (build.status === 'queued' || build.status === 'running') {
      if (Date.now() >= deadline) throw new Error('Hosted build timed out');
      await delay(this.pollIntervalMilliseconds, request.signal);
      const listed = await decodeHostedResponse(
        await this.fetch(endpoint, {
          credentials: 'same-origin',
          signal: request.signal ?? null,
        }),
        HostedBuildsResponseSchema,
      );
      const current = listed.builds.find(({ id }) => id === build.id);
      if (!current) throw new Error('Hosted build disappeared from build history');
      build = current;
    }

    const artifacts = await Promise.all(
      (build.result?.artifacts ?? []).map(async (artifact): Promise<MapCompileArtifact> => {
        const response = await this.fetch(
          `${endpoint}/${encodeURIComponent(build.id)}/artifacts/${artifact.sha256}`,
          { credentials: 'same-origin', signal: request.signal ?? null },
        );
        if (!response.ok)
          throw new Error(`Could not download ${artifact.name} (${response.status})`);
        return {
          name: artifact.name,
          kind: artifact.kind,
          mediaType: artifact.mediaType,
          data: await response.arrayBuffer(),
        };
      }),
    );
    return {
      backend: this.backend,
      status: build.status,
      buildId: build.id,
      sourceDocumentRevision: build.mapVersion,
      diagnostics:
        build.status === 'failed' && build.result?.error
          ? [{ severity: 'error', stage: 'hosted-build', message: build.result.error }]
          : (build.result?.diagnostics ?? []),
      logs: build.result?.logs ?? [],
      artifacts,
      elapsedMilliseconds: build.result?.elapsedMilliseconds ?? 0,
    };
  }

  public async launch(_request: MapLaunchRequest): Promise<MapLaunchResult> {
    throw new Error('Hosted game launch is not configured');
  }
}
