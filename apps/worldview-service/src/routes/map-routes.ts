import {
  CreateHostedCheckpointRequestSchema,
  HostedCheckpointResponseSchema,
  HostedMapResponseSchema,
  HostedRealtimeTicketResponseSchema,
  ReplaceHostedMapSourceRequestSchema,
  ReplaceHostedMapSourceResultSchema,
} from '@worldview/protocol';
import { parseMapSource } from '@jackharrhy/worldview-editor/core';

import { canEditProject } from '../access-policy.js';
import { signRealtimeTicket } from '../realtime-ticket.js';
import {
  allowMutation,
  MAX_HOSTED_MAP_BYTES,
  requestBody,
  requireUser,
  sendError,
  sendJson,
} from '../service-http.js';
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
      'replace-map-source',
      'PUT',
      /^\/api\/projects\/([^/]+)\/maps\/([^/]+)\/source$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const projectId = pathParameter(match, 0);
        const mapId = pathParameter(match, 1);
        const map = options.database.map(mapId, user.id);
        if (!map || map.projectId !== projectId) {
          return sendError(context.response, 404, 'Map not found in project');
        }
        if (!canEditProject(map.role)) {
          return sendError(context.response, 403, 'Editor access required');
        }
        const input = await requestBody(
          context.request,
          ReplaceHostedMapSourceRequestSchema,
          2 * MAX_HOSTED_MAP_BYTES + 1024,
        );
        if (Buffer.byteLength(input.source) > MAX_HOSTED_MAP_BYTES) {
          return sendError(context.response, 413, 'Hosted maps are limited to 2 MiB of source');
        }
        try {
          if (parseMapSource(input.source).document.faceSyntax !== map.format) {
            return sendError(
              context.response,
              400,
              'Map face syntax does not match the hosted map',
            );
          }
        } catch (error) {
          return sendError(
            context.response,
            400,
            `Invalid map source: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const result = await options.maps.replaceSource(
          mapId,
          user.id,
          input.expectedMapVersion,
          input.expectedSourceSha256,
          input.source,
        );
        sendJson(
          context.response,
          result.status === 'replaced' ? 200 : 409,
          ReplaceHostedMapSourceResultSchema,
          result,
        );
      },
    ),
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
