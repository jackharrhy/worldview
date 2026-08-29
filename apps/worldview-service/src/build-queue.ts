import type { BlobStore } from './blob-store.js';
import type { WorldviewDatabase } from './database.js';

interface NativeResult {
  readonly status: 'succeeded' | 'failed';
  readonly diagnostics: readonly unknown[];
  readonly logs: readonly unknown[];
  readonly elapsedMilliseconds: number;
  readonly artifacts: readonly { name: string; kind: string; mediaType: string; base64: string }[];
}

export class RemoteBuildQueue {
  private readonly pending: (() => Promise<void>)[] = [];
  private active = 0;
  public constructor(
    private readonly database: WorldviewDatabase,
    private readonly blobs: BlobStore,
    private readonly endpoints: Partial<Record<'quake' | 'goldsrc', string>>,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
    private readonly concurrency = 1,
    private readonly maxPending = 3,
  ) {}

  public enqueue(input: {
    id: string;
    game: 'quake' | 'goldsrc';
    mapName: string;
    source: string;
    mapVersion: number;
    sourceSha256: string;
    profileId: string;
    quality: 'preview' | 'final';
    assets: readonly { name: string; mediaType: string; bytes: Uint8Array }[];
  }): boolean {
    if (this.pending.length >= this.maxPending) return false;
    this.pending.push(async () => {
      this.database.updateBuild(input.id, 'running');
      try {
        const endpoint = this.endpoints[input.game];
        if (!endpoint) throw new Error(`No ${input.game} build worker is configured`);
        const response = await this.fetch(new URL('/compile', endpoint), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mapName: input.mapName.replace(/\.map$/i, ''),
            mapText: input.source,
            quality: input.quality,
            profileId: input.profileId,
            expectedDocumentRevision: input.mapVersion,
            assets: input.assets.map((asset) => ({
              name: asset.name,
              mediaType: asset.mediaType,
              base64: Buffer.from(asset.bytes).toString('base64'),
            })),
          }),
          signal: AbortSignal.timeout(190_000),
        });
        const result = (await response.json()) as NativeResult | { error?: unknown };
        if (!response.ok || !('status' in result)) {
          const detail = 'error' in result ? result.error : null;
          throw new Error(
            typeof detail === 'string' ? detail : `Build worker failed (${response.status})`,
          );
        }
        const artifacts = [];
        for (const artifact of result.artifacts) {
          const blob = await this.blobs.put(Buffer.from(artifact.base64, 'base64'));
          artifacts.push({
            name: artifact.name,
            kind: artifact.kind,
            mediaType: artifact.mediaType,
            sha256: blob.sha256,
            size: blob.size,
          });
        }
        this.database.updateBuild(
          input.id,
          result.status,
          {
            diagnostics: result.diagnostics,
            logs: result.logs,
            elapsedMilliseconds: result.elapsedMilliseconds,
            artifacts,
          },
          input.sourceSha256,
        );
      } catch (error) {
        this.database.updateBuild(
          input.id,
          'failed',
          { error: error instanceof Error ? error.message : String(error) },
          input.sourceSha256,
        );
      }
    });
    this.drain();
    return true;
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length) {
      const task = this.pending.shift()!;
      this.active += 1;
      void task().finally(() => {
        this.active -= 1;
        this.drain();
      });
    }
  }
}
