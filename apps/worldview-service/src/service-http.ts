import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  HostedErrorResponseSchema,
  HostedOkResponseSchema,
  type HostedSessionUser,
} from '@worldview/protocol';
import type { z } from 'zod';

import type { WorldviewDatabase, WorldviewUser } from './database.js';

export const SESSION_COOKIE = 'worldview_session';
export const OAUTH_COOKIE = 'worldview_oauth';
export const MAX_HOSTED_MAP_BYTES = 2 * 1024 * 1024;

export interface ServiceRequestContext {
  readonly request: IncomingMessage;
  readonly response: ServerResponse;
  readonly url: URL;
  readonly publicOrigin: string;
  readonly secureCookies: boolean;
}

export class ServiceHttpError extends Error {
  public constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of request.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setCookie(
  response: ServerResponse,
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): void {
  const serialized = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAge))}${secure ? '; Secure' : ''}`;
  const existing = response.getHeader('Set-Cookie');
  response.setHeader('Set-Cookie', [
    ...(Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : []),
    serialized,
  ]);
}

export function sendJson<Schema extends z.ZodType>(
  response: ServerResponse,
  status: number,
  schema: Schema,
  value: z.input<Schema>,
): void {
  const payload = JSON.stringify(schema.parse(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

export function sendError(response: ServerResponse, status: number, message: string): void {
  sendJson(response, status, HostedErrorResponseSchema, { error: message.slice(0, 16_384) });
}

export function sendOk(response: ServerResponse, status = 200): void {
  sendJson(response, status, HostedOkResponseSchema, { ok: true });
}

export function redirect(response: ServerResponse, location: string): void {
  response.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

export async function requestBody<T>(
  request: IncomingMessage,
  schema: z.ZodType<T>,
  limit = 1024 * 1024,
): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new ServiceHttpError(413, 'Request body is too large');
    chunks.push(bytes);
  }
  let value: unknown;
  try {
    value = size === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ServiceHttpError(400, 'Request body contains invalid JSON');
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const path = result.error.issues[0]?.path.join('.');
    throw new ServiceHttpError(
      400,
      path ? `Request field ${path} is invalid` : 'Request body is invalid',
    );
  }
  return result.data;
}

export function allowMutation(context: ServiceRequestContext): boolean {
  const site = context.request.headers['sec-fetch-site'];
  const origin = context.request.headers.origin;
  const allowed =
    (!site || site === 'same-origin' || site === 'none') &&
    (!origin || origin === context.publicOrigin);
  if (!allowed) sendError(context.response, 403, 'Cross-origin mutation rejected');
  return allowed;
}

export function sessionUser(
  context: ServiceRequestContext,
  database: WorldviewDatabase,
): WorldviewUser | null {
  return database.sessionUser(cookie(context.request, SESSION_COOKIE));
}

export function requireUser(
  context: ServiceRequestContext,
  database: WorldviewDatabase,
): WorldviewUser | null {
  const user = sessionUser(context, database);
  if (!user) sendError(context.response, 401, 'Authentication required');
  return user;
}

export function publicSessionUser(user: WorldviewUser | null): HostedSessionUser | null {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
  };
}

export function handleRequestError(response: ServerResponse, error: unknown): void {
  const candidate =
    typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
      ? error.status
      : 500;
  const status =
    Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : 500;
  if (status >= 500) {
    console.error(
      JSON.stringify({
        message: 'Worldview service request failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  if (response.headersSent) {
    response.destroy();
    return;
  }
  sendError(
    response,
    status,
    status >= 500
      ? 'Internal server error'
      : error instanceof Error
        ? error.message
        : String(error),
  );
}
