export { MapRoom } from './map-room.js';
import { deriveBrush, type MapDocument } from '@jackharrhy/worldview-editor/core';

function roomFromPath(pathname: string): string | null {
  const match = /^\/rooms\/([^/]+)$/.exec(pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

function isMapDocument(value: unknown): value is MapDocument {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'revision' in value &&
    typeof value.revision === 'number' &&
    'format' in value &&
    (value.format === 'valve-220' || value.format === 'quake') &&
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
        'brushes' in entity &&
        Array.isArray(entity.brushes) &&
        entity.brushes.every(
          (brush: unknown) =>
            typeof brush === 'object' &&
            brush !== null &&
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
    for (const brush of entity.brushes) {
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
      const roomId = roomFromPath(url.pathname);
      if (!roomId || roomId.length > 128)
        return Response.json({ error: 'Not found' }, { status: 404 });
      const stub = env.MAP_ROOMS.getByName(roomId);
      if (request.method === 'PUT') {
        const document: unknown = await request.json();
        if (!isMapDocument(document)) {
          return Response.json({ error: 'A map document is required' }, { status: 400 });
        }
        const baselineError = validateBaseline(document);
        if (baselineError) return Response.json({ error: baselineError }, { status: 400 });
        return Response.json(await stub.initializeBaseline(roomId, document));
      }
      if (
        request.method === 'GET' &&
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
      ) {
        return Response.json(await stub.snapshot(roomId));
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
      return Response.json({ error: 'Collaboration request failed' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
