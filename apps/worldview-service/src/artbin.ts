import { createHash } from 'node:crypto';

export interface ArtbinConfig {
  readonly url: string;
  readonly fourmUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface ArtbinAsset {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly kind: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sha256: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly folder: { readonly id: string; readonly name: string; readonly slug: string } | null;
  readonly tags: readonly {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  }[];
}

export interface ArtbinCatalog {
  readonly assets: readonly ArtbinAsset[];
  readonly nextCursor: string | null;
}

export interface ArtbinWadInspection {
  readonly asset: ArtbinAsset;
  readonly wad: {
    readonly version: 'WAD2' | 'WAD3';
    readonly lumpCount: number;
    readonly textures: readonly {
      readonly index: number;
      readonly name: string;
      readonly width: number;
      readonly height: number;
      readonly transparent: boolean;
    }[];
  };
}

interface CachedToken {
  readonly value: string;
  readonly renewAt: number;
}

interface ArtbinErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: unknown;
  };
}

const MACHINE_SCOPES = 'artbin:assets:read artbin:assets:content';
const RENEWAL_SKEW_MS = 30_000;

function integrationError(response: Response, body: ArtbinErrorBody): Error & { status: number } {
  const code = body.error?.code;
  const upstreamMessage = body.error?.message;
  const message =
    code === 'asset_not_found'
      ? 'Artbin asset not found'
      : code === 'asset_hash_changed'
        ? 'Artbin asset changed since it was mounted'
        : code === 'insufficient_scope'
          ? 'Artbin machine identity has insufficient scope'
          : code === 'invalid_token'
            ? 'Artbin machine authentication failed'
            : upstreamMessage || 'Artbin is unavailable';
  const status =
    response.status === 404
      ? 404
      : response.status === 409
        ? 409
        : response.status === 503
          ? 503
          : response.status === 400 || response.status === 413 || response.status === 422
            ? response.status
            : 502;
  return Object.assign(new Error(message), { status, code, details: body.error?.details });
}

async function errorBody(response: Response): Promise<ArtbinErrorBody> {
  try {
    return (await response.json()) as ArtbinErrorBody;
  } catch {
    return {};
  }
}

export class ArtbinClient {
  private token: CachedToken | undefined;
  private tokenRequest: Promise<CachedToken> | undefined;

  public constructor(
    private readonly config: ArtbinConfig,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async acquireToken(): Promise<CachedToken> {
    const body = new URLSearchParams({ grant_type: 'client_credentials', scope: MACHINE_SCOPES });
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      'utf8',
    ).toString('base64');
    const response = await this.fetch(new URL('/oauth/token', this.config.fourmUrl), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }).catch(() => {
      throw Object.assign(new Error('4orm machine authentication is unavailable'), { status: 503 });
    });
    if (!response.ok)
      throw Object.assign(new Error('4orm machine authentication is unavailable'), {
        status: response.status === 503 ? 503 : 502,
      });
    const result = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      token_type?: unknown;
      expires_in?: unknown;
    } | null;
    if (
      !result ||
      typeof result.access_token !== 'string' ||
      (result.token_type !== undefined &&
        (typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer')) ||
      typeof result.expires_in !== 'number' ||
      !Number.isFinite(result.expires_in) ||
      result.expires_in <= 0
    )
      throw Object.assign(new Error('4orm returned an invalid machine token'), { status: 502 });
    return {
      value: result.access_token,
      renewAt: this.now() + Math.max(0, result.expires_in * 1000 - RENEWAL_SKEW_MS),
    };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now() < this.token.renewAt) return this.token.value;
    if (!this.tokenRequest) {
      this.tokenRequest = this.acquireToken();
      void this.tokenRequest.then(
        (token) => {
          this.token = token;
          this.tokenRequest = undefined;
        },
        () => {
          this.tokenRequest = undefined;
        },
      );
    }
    return (await this.tokenRequest).value;
  }

  private async request(path: string, retryInvalidToken = true): Promise<Response> {
    const token = await this.accessToken();
    const response = await this.fetch(new URL(path, this.config.url), {
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {
      throw Object.assign(new Error('Artbin is unavailable'), { status: 503 });
    });
    if (response.ok) return response;
    const body = await errorBody(response);
    if (response.status === 401 && body.error?.code === 'invalid_token' && retryInvalidToken) {
      this.token = undefined;
      return this.request(path, false);
    }
    throw integrationError(response, body);
  }

  public async search(parameters: URLSearchParams): Promise<ArtbinCatalog> {
    const query = parameters.size ? `?${parameters}` : '';
    return this.request(`/api/assets${query}`).then(
      (response) => response.json() as Promise<ArtbinCatalog>,
    );
  }

  public async metadata(id: string): Promise<{ asset: ArtbinAsset }> {
    return this.request(`/api/assets/${encodeURIComponent(id)}`).then(
      (response) => response.json() as Promise<{ asset: ArtbinAsset }>,
    );
  }

  public async content(id: string, expectedSha256: string): Promise<Uint8Array> {
    const parameters = new URLSearchParams({ sha256: expectedSha256 });
    const response = await this.request(
      `/api/assets/${encodeURIComponent(id)}/content?${parameters}`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedSha256)
      throw Object.assign(new Error('Artbin content failed SHA-256 verification'), { status: 502 });
    return bytes;
  }

  public async inspectWad(id: string): Promise<ArtbinWadInspection> {
    return this.request(`/api/assets/${encodeURIComponent(id)}/wad`).then(
      (response) => response.json() as Promise<ArtbinWadInspection>,
    );
  }
}
