import { createHash, randomBytes } from 'node:crypto';
import type { WorldviewDatabase, WorldviewUser } from './database.js';

export interface OAuthConfig {
  readonly fourmUrl: string;
  readonly clientId: string;
  readonly publicUrl: string;
}

export interface OAuthProfile {
  readonly sub: string;
  readonly username: string;
  readonly display_name: string;
  readonly is_admin: boolean;
}

export function codeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function safeReturnTo(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const parsed = new URL(value, 'https://worldview.invalid');
    return parsed.origin === 'https://worldview.invalid'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/';
  } catch {
    return '/';
  }
}

export function beginAuthorization(
  database: WorldviewDatabase,
  config: OAuthConfig,
  returnTo: string,
): { url: string; state: string } {
  const verifier = codeVerifier();
  const transaction = database.beginOauth(safeReturnTo(returnTo), verifier);
  const redirectUri = `${config.publicUrl}/auth/callback`;
  const url = new URL('/oauth/authorize', config.fourmUrl);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile',
    state: transaction.state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return { url: url.toString(), state: transaction.state };
}

export function consumeAuthorizationTransaction(input: {
  readonly database: WorldviewDatabase;
  readonly state: string;
  readonly cookieState: string | undefined;
}): { verifier: string; returnTo: string } {
  if (!input.cookieState || input.cookieState !== input.state)
    throw Object.assign(new Error('OAuth state mismatch'), { status: 400 });
  const transaction = input.database.consumeOauth(input.state);
  if (!transaction)
    throw Object.assign(new Error('OAuth transaction is missing or expired'), { status: 400 });
  return transaction;
}

export async function completeAuthorization(input: {
  readonly database: WorldviewDatabase;
  readonly config: OAuthConfig;
  readonly state: string;
  readonly code: string;
  readonly cookieState: string | undefined;
  readonly fetch: typeof globalThis.fetch;
}): Promise<{ user: WorldviewUser; returnTo: string }> {
  const transaction = consumeAuthorizationTransaction(input);
  const tokenResponse = await input.fetch(new URL('/oauth/token', input.config.fourmUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: `${input.config.publicUrl}/auth/callback`,
      client_id: input.config.clientId,
      code_verifier: transaction.verifier,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`4orm token exchange failed (${tokenResponse.status})`);
  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: unknown;
    token_type?: unknown;
    expires_in?: unknown;
  };
  if (
    typeof tokenPayload.access_token !== 'string' ||
    (tokenPayload.token_type !== undefined &&
      (typeof tokenPayload.token_type !== 'string' ||
        tokenPayload.token_type.toLowerCase() !== 'bearer')) ||
    (tokenPayload.expires_in !== undefined &&
      (typeof tokenPayload.expires_in !== 'number' ||
        !Number.isFinite(tokenPayload.expires_in) ||
        tokenPayload.expires_in <= 0))
  ) {
    throw new Error('4orm returned an invalid access token response');
  }
  const profileResponse = await input.fetch(new URL('/oauth/userinfo', input.config.fourmUrl), {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  if (!profileResponse.ok) throw new Error(`4orm userinfo failed (${profileResponse.status})`);
  const profile = (await profileResponse.json()) as Partial<OAuthProfile>;
  if (
    typeof profile.sub !== 'string' ||
    typeof profile.username !== 'string' ||
    typeof profile.display_name !== 'string'
  ) {
    throw new Error('4orm returned invalid userinfo');
  }
  return {
    user: input.database.upsertUser({
      fourmSub: profile.sub,
      username: profile.username,
      displayName: profile.display_name,
      isAdmin: profile.is_admin === true,
    }),
    returnTo: transaction.returnTo,
  };
}
