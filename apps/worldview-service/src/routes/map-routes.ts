import {
  CreateHostedCheckpointRequestSchema,
  HostedCheckpointResponseSchema,
  HostedMapResponseSchema,
  HostedRealtimeTicketResponseSchema,
} from '@worldview/protocol';

import { canEditProject } from '../access-policy.js';
import { signRealtimeTicket } from '../realtime-ticket.js';
import { allowMutation, requestBody, requireUser, sendError, sendJson } from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

export function createMapRoutes(
  options: Pick<WorldviewServiceOptions, 'database' | 'maps' | 'realtimeTicketSecret'>,
) {
  return [
    defineRoute('get-map', 'GET', /^\/api\/maps\/([^/]+)$/, async (context, match) => {
      const user = requireUser(context, options.database);
      if (!user) return;
      const map = options.database.map(pathParameter(match, 0), user.id);
      if (!map) return sendError(context.response, 404, 'Map not found');
      const snapshot = await options.maps.snapshot(map.id);
      sendJson(context.response, 200, HostedMapResponseSchema, {
        map: {
          ...map,
          ...snapshot,
          actorId: user.id,
          displayName: user.displayName,
        },
      });
    }),
    defineRoute(
      'create-map-checkpoint',
      'POST',
      /^\/api\/maps\/([^/]+)\/checkpoints$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const input = await requestBody(context.request, CreateHostedCheckpointRequestSchema);
        const mapId = pathParameter(match, 0);
        const map = options.database.map(mapId, user.id);
        if (!map || !canEditProject(map.role)) {
          return sendError(context.response, 403, 'Editor access required');
        }
        const checkpoint = await options.maps.createCheckpoint(mapId, input.name, user.id);
        sendJson(context.response, 201, HostedCheckpointResponseSchema, { checkpoint });
      },
    ),
    defineRoute(
      'create-realtime-ticket',
      'POST',
      /^\/api\/maps\/([^/]+)\/realtime-ticket$/,
      (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const map = options.database.map(pathParameter(match, 0), user.id);
        if (!map) return sendError(context.response, 404, 'Map not found');
        const expiresAt = Date.now() + 60_000;
        sendJson(context.response, 201, HostedRealtimeTicketResponseSchema, {
          ticket: signRealtimeTicket(
            {
              version: 2,
              mapId: map.id,
              principalId: user.id,
              actorId: user.id,
              role: map.role,
              expiresAt,
            },
            options.realtimeTicketSecret,
          ),
          expiresAt,
          actorId: user.id,
          displayName: user.displayName,
        });
      },
    ),
  ] as const;
}
