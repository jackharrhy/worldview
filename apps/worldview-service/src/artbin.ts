import { createHash } from 'node:crypto';

export interface ArtbinConfig {
  readonly url: string;
  readonly token: string;
}

export class ArtbinClient {
  public constructor(
    private readonly config: ArtbinConfig,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  private async request(path: string): Promise<Response> {
    const response = await this.fetch(new URL(path, this.config.url), {
      headers: { Authorization: `Bearer ${this.config.token}` },
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 404
            ? 'Artbin asset not found'
            : response.status === 401
              ? 'Artbin integration is unauthorized'
              : 'Artbin is unavailable',
        ),
        { status: response.status === 404 ? 404 : 502 },
      );
    return response;
  }

  public async search(parameters: URLSearchParams): Promise<unknown> {
    return this.request(`/api/worldview/assets?${parameters}`).then((response) => response.json());
  }

  public async metadata(id: string): Promise<{
    asset: {
      id: string;
      name: string;
      kind: string;
      mimeType: string;
      size: number;
      sha256: string | null;
    };
  }> {
    return this.request(`/api/worldview/assets/${encodeURIComponent(id)}`).then((response) =>
      response.json(),
    ) as Promise<{
      asset: {
        id: string;
        name: string;
        kind: string;
        mimeType: string;
        size: number;
        sha256: string | null;
      };
    }>;
  }

  public async content(id: string, expectedSha256: string): Promise<Uint8Array> {
    const bytes = new Uint8Array(
      await (
        await this.request(`/api/worldview/assets/${encodeURIComponent(id)}/content`)
      ).arrayBuffer(),
    );
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedSha256)
      throw Object.assign(new Error('Artbin asset changed since it was mounted'), { status: 409 });
    return bytes;
  }
}
