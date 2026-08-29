export { MapRoom } from './map-room.js';
import { deriveBrush, type MapDocument } from '@jackharrhy/worldview-editor/core';
import { verifyHostedRealtimeTicket } from './realtime-ticket.js';

function roomFromPath(pathname: string): string | null {
  const match = /^\/rooms\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Origin': '*',
} as const;

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, content] of Object.entries(corsHeaders)) headers.set(name, content);
  return Response.json(value, { ...init, headers });
}

function isMapDocument(value: unknown): value is MapDocument {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'revision' in value &&
    typeof value.revision === 'number' &&
    'format' in value &&
    value.format === 'quake-map' &&
    'faceSyntax' in value &&
    (value.faceSyntax === 'valve-220' || value.faceSyntax === 'quake') &&
    'entities' in value &&
    Array.isArray(value.entities) &&
    value.entities.every(
      (entity) =>
        typeof entity === 'object' &&
        entity !== null &&
        'id' in entity &&
        typeof entity.id === 'string' &&
        'properties' in entity &&
        typeof entity.properties === 'object' &&
        entity.properties !== null &&
        'primitives' in entity &&
        Array.isArray(entity.primitives) &&
        entity.primitives.every(
          (brush: unknown) =>
            typeof brush === 'object' &&
            brush !== null &&
            'kind' in brush &&
            brush.kind === 'brush' &&
            'id' in brush &&
            typeof brush.id === 'string' &&
            'revision' in brush &&
            typeof brush.revision === 'number' &&
            'faces' in brush &&
            Array.isArray(brush.faces),
        ),
    )
  );
}

function validateBaseline(document: MapDocument): string | null {
  if (document.entities.length > 100_000) return 'Map baseline contains too many entities';
  const objectIds = new Set<string>();
  for (const entity of document.entities) {
    if (objectIds.has(entity.id)) return `Duplicate object ID ${entity.id}`;
    objectIds.add(entity.id);
    for (const brush of entity.primitives) {
      if (brush.kind !== 'brush')
        return `Collaboration baseline does not support ${brush.kind} primitives`;
      if (objectIds.has(brush.id)) return `Duplicate object ID ${brush.id}`;
      objectIds.add(brush.id);
      const geometry = deriveBrush(brush);
      if (!geometry.valid) return `Invalid brush ${brush.id}`;
      for (const face of brush.faces) {
        if (objectIds.has(face.id)) return `Duplicate object ID ${face.id}`;
        objectIds.add(face.id);
      }
    }
  }
  return null;
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: corsHeaders });
      const roomId = roomFromPath(url.pathname);
      if (!roomId || roomId.length > 128) return json({ error: 'Not found' }, { status: 404 });
      const stub = env.MAP_ROOMS.getByName(roomId);
      if (roomId.startsWith('hosted_')) {
        const authorization = request.headers.get('Authorization');
        const ticketValue = authorization?.startsWith('Bearer ')
          ? authorization.slice(7)
          : url.searchParams.get('access_token');
        const ticket = ticketValue
          ? await verifyHostedRealtimeTicket(ticketValue, env.WORLDVIEW_TICKET_SECRET)
          : null;
        if (!ticket || ticket.roomId !== roomId) {
          return json({ error: 'A valid hosted-map ticket is required' }, { status: 401 });
        }
        if (request.method === 'PUT' && ticket.role === 'viewer') {
          return json({ error: 'Editor access is required' }, { status: 403 });
        }
        url.searchParams.delete('access_token');
        url.searchParams.set('actor', ticket.actorId);
        url.searchParams.set('role', ticket.role);
      }
      if (request.method === 'PUT') {
        const document: unknown = await request.json();
        if (!isMapDocument(document)) {
          return json({ error: 'A map document is required' }, { status: 400 });
        }
        const baselineError = validateBaseline(document);
        if (baselineError) return json({ error: baselineError }, { status: 400 });
        return json(await stub.initializeBaseline(roomId, document));
      }
      if (
        request.method === 'GET' &&
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
      ) {
        return json(await stub.snapshot(roomId));
      }
      url.searchParams.set('room', roomId);
      return stub.fetch(new Request(url, request));
    } catch (error) {
      console.error(
        JSON.stringify({
          message: 'Collaboration request failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json({ error: 'Collaboration request failed' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
