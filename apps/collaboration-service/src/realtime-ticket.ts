export interface HostedRealtimeTicket {
  readonly version: 1;
  readonly mapId: string;
  readonly roomId: string;
  readonly principalId: string;
  readonly actorId: string;
  readonly role: 'owner' | 'editor' | 'viewer';
  readonly expiresAt: number;
}

function decode(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(`${normalized}${'='.repeat((4 - (normalized.length % 4)) % 4)}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function verifyHostedRealtimeTicket(
  ticket: string,
  secret: string,
): Promise<HostedRealtimeTicket | null> {
  const [header, content, signature, extra] = ticket.split('.');
  if (!header || !content || !signature || extra || secret.length < 32) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decode(signature),
      new TextEncoder().encode(`${header}.${content}`),
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(decode(content)),
    ) as Partial<HostedRealtimeTicket>;
    if (
      payload.version !== 1 ||
      typeof payload.mapId !== 'string' ||
      typeof payload.roomId !== 'string' ||
      typeof payload.principalId !== 'string' ||
      typeof payload.actorId !== 'string' ||
      (payload.role !== 'owner' && payload.role !== 'editor' && payload.role !== 'viewer') ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now()
    )
      return null;
    return payload as HostedRealtimeTicket;
  } catch {
    return null;
  }
}
