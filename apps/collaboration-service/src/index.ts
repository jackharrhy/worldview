export { MapCell } from './map-cell.js';
import {
  MapCellCheckpointRequestSchema,
  MapCellInitializeRequestSchema,
} from '@worldview/protocol';
import { verifyHostedRealtimeTicket } from './realtime-ticket.js';

type MapAction = 'snapshot' | 'live' | 'initialize' | 'checkpoints';

function isMapAction(value: string | undefined): value is MapAction {
  return (
    value === 'snapshot' || value === 'live' || value === 'initialize' || value === 'checkpoints'
  );
}

function mapFromPath(pathname: string): { mapId: string; action: MapAction } | null {
  const match = /^\/sync\/maps\/([^/]+)\/(snapshot|live|initialize|checkpoints)$/.exec(pathname);
  return match?.[1] && isMapAction(match[2])
    ? { mapId: decodeURIComponent(match[1]), action: match[2] }
    : null;
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Origin': '*',
} as const;

function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, content] of Object.entries(corsHeaders)) headers.set(name, content);
  return Response.json(value, { ...init, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: corsHeaders });
      const route = mapFromPath(url.pathname);
      if (!route || route.mapId.length > 128) return json({ error: 'Not found' }, { status: 404 });
      const authorization = request.headers.get('Authorization');
      const ticketValue = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : url.searchParams.get('access_token');
      const ticket = ticketValue
        ? await verifyHostedRealtimeTicket(ticketValue, env.WORLDVIEW_REALTIME_TICKET_SECRET)
        : null;
      if (!ticket || ticket.mapId !== route.mapId) {
        return json({ error: 'A valid hosted-map ticket is required' }, { status: 401 });
      }
      if (request.method !== 'GET' && ticket.role === 'viewer') {
        return json({ error: 'Editor access is required' }, { status: 403 });
      }
      url.searchParams.delete('access_token');
      url.searchParams.set('actor', ticket.actorId);
      url.searchParams.set('role', ticket.role);
      const stub = env.MAP_CELLS.getByName(route.mapId);
      if (request.method === 'PUT' && route.action === 'initialize') {
        const input = MapCellInitializeRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!input.success) {
          return json({ error: 'Map source is required' }, { status: 400 });
        }
        return json(await stub.initialize(route.mapId, input.data.source));
      }
      if (request.method === 'GET' && route.action === 'snapshot') {
        return json(await stub.snapshot(route.mapId));
      }
      if (request.method === 'GET' && route.action === 'checkpoints') {
        return json({ checkpoints: await stub.listCheckpoints() });
      }
      if (request.method === 'POST' && route.action === 'checkpoints') {
        const input = MapCellCheckpointRequestSchema.safeParse(
          await request.json().catch(() => null),
        );
        if (!input.success) {
          return json({ error: 'Checkpoint name is required' }, { status: 400 });
        }
        return json({ checkpoint: await stub.createCheckpoint(ticket.actorId, input.data.name) });
      }
      if (route.action !== 'live') return json({ error: 'Not found' }, { status: 404 });
      url.searchParams.set('map', route.mapId);
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
