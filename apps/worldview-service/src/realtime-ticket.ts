import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ProjectRole, ShareRole } from './database.js';

export interface RealtimeTicketPayload {
  readonly version: 1;
  readonly mapId: string;
  readonly roomId: string;
  readonly principalId: string;
  readonly actorId: string;
  readonly role: ProjectRole | ShareRole;
  readonly expiresAt: number;
}

function encoded(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export function signRealtimeTicket(payload: RealtimeTicketPayload, secret: string): string {
  if (secret.length < 32)
    throw new Error('Realtime ticket secret must contain at least 32 characters');
  const header = encoded(JSON.stringify({ algorithm: 'HS256', type: 'WVT' }));
  const content = encoded(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${content}`).digest('base64url');
  return `${header}.${content}.${signature}`;
}

export function verifyRealtimeTicket(ticket: string, secret: string): RealtimeTicketPayload | null {
  const [header, content, signature, extra] = ticket.split('.');
  if (!header || !content || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(`${header}.${content}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(content, 'base64url').toString('utf8'),
    ) as Partial<RealtimeTicketPayload>;
    if (
      payload.version !== 1 ||
      typeof payload.mapId !== 'string' ||
      typeof payload.roomId !== 'string' ||
      typeof payload.principalId !== 'string' ||
      typeof payload.actorId !== 'string' ||
      !['owner', 'editor', 'viewer'].includes(String(payload.role)) ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now()
    )
      return null;
    return payload as RealtimeTicketPayload;
  } catch {
    return null;
  }
}
