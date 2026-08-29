import type {
  MapBuildCapabilities,
  MapBuildService,
  MapCompileArtifact,
  MapCompileDiagnostic,
  MapCompileLog,
  MapCompileRequest,
  MapCompileResult,
  MapLaunchRequest,
  MapLaunchResult,
  WorldviewGameProfile,
} from '@jackharrhy/worldview-editor';

type BuildStatus = 'queued' | 'running' | 'succeeded' | 'failed';

interface HostedArtifact {
  readonly name: string;
  readonly kind: MapCompileArtifact['kind'];
  readonly mediaType: string;
  readonly sha256: string;
}

interface HostedBuild {
  readonly id: string;
  readonly mapVersion: number;
  readonly status: BuildStatus;
  readonly result: {
    readonly error?: string;
    readonly diagnostics?: readonly MapCompileDiagnostic[];
    readonly logs?: readonly MapCompileLog[];
    readonly elapsedMilliseconds?: number;
    readonly artifacts?: readonly HostedArtifact[];
  } | null;
}

interface HostedMapBuildServiceOptions {
  readonly mapId: string;
  readonly game: WorldviewGameProfile;
  readonly fetch?: typeof globalThis.fetch;
  readonly pollIntervalMilliseconds?: number;
  readonly timeoutMilliseconds?: number;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as ({ error?: unknown } & T) | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `Build request failed (${response.status})`,
    );
  if (!payload) throw new Error('Build service returned an empty response');
  return payload;
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Build cancelled', 'AbortError'));
      },
      { once: true },
    );
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
    const response = await responseJson<{ capability: { profileId: string } | null }>(
      await this.fetch(this.endpoint(), {
        credentials: 'same-origin',
        signal: signal ?? null,
      }),
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
    const created = await responseJson<{ build: HostedBuild }>(
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
    );
    const deadline = Date.now() + this.timeoutMilliseconds;
    let build = created.build;
    while (build.status === 'queued' || build.status === 'running') {
      if (Date.now() >= deadline) throw new Error('Hosted build timed out');
      await delay(this.pollIntervalMilliseconds, request.signal);
      const listed = await responseJson<{ builds: readonly HostedBuild[] }>(
        await this.fetch(endpoint, {
          credentials: 'same-origin',
          signal: request.signal ?? null,
        }),
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
