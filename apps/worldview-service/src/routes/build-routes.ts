import {
  CreateHostedBuildRequestSchema,
  HostedBuildCreatedResponseSchema,
  HostedBuildsResponseSchema,
} from '@worldview/protocol';

import { submitHostedBuild } from '../hosted-build-operation.js';
import { hostedBuildProfile } from '../hosted-game-profiles.js';
import {
  allowMutation,
  requestBody,
  requireUser,
  sendError,
  sendJson,
  ServiceHttpError,
} from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

export function createBuildRoutes(
  options: Pick<WorldviewServiceOptions, 'blobs' | 'builds' | 'database' | 'maps'>,
) {
  return [
    defineRoute('list-map-builds', 'GET', /^\/api\/maps\/([^/]+)\/builds$/, (context, match) => {
      const user = requireUser(context, options.database);
      if (!user) return;
      const mapId = pathParameter(match, 0);
      const map = options.database.map(mapId, user.id);
      if (!map) return sendError(context.response, 404, 'Map not found');
      sendJson(context.response, 200, HostedBuildsResponseSchema, {
        builds: [...(options.database.listBuilds(mapId, user.id) ?? [])],
        capability: options.builds?.supports(map.game)
          ? {
              profileId: 'default',
              durationHint: hostedBuildProfile(map.game).durationHint,
            }
          : null,
      });
    }),
    defineRoute(
      'create-map-build',
      'POST',
      /^\/api\/maps\/([^/]+)\/builds$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const input = await requestBody(context.request, CreateHostedBuildRequestSchema);
        try {
          const build = await submitHostedBuild(options, {
            mapId: pathParameter(match, 0),
            userId: user.id,
            quality: input.quality,
            ...(input.expectedMapVersion !== undefined
              ? { expectedMapVersion: input.expectedMapVersion }
              : {}),
          });
          sendJson(context.response, 202, HostedBuildCreatedResponseSchema, { build });
        } catch (error) {
          if (!(error instanceof ServiceHttpError)) throw error;
          if (error.status === 429) {
            context.response.setHeader(
              'Retry-After',
              error.message === 'Build limit reached; try again later' ? '3600' : '30',
            );
          }
          sendError(context.response, error.status, error.message);
        }
      },
    ),
    defineRoute(
      'get-build-artifact',
      'GET',
      /^\/api\/maps\/([^/]+)\/builds\/([^/]+)\/artifacts\/([a-f0-9]{64})$/,
      async (context, match) => {
        const user = requireUser(context, options.database);
        if (!user) return;
        const build = options.database.build(
          pathParameter(match, 0),
          pathParameter(match, 1),
          user.id,
        );
        const sha256 = pathParameter(match, 2);
        const artifact = build?.result?.artifacts?.find((candidate) => candidate.sha256 === sha256);
        if (!artifact) return sendError(context.response, 404, 'Build artifact not found');
        const bytes = await options.blobs.get(artifact.sha256);
        if (!bytes) return sendError(context.response, 404, 'Build artifact data not found');
        context.response.writeHead(200, {
          'Content-Type': artifact.mediaType,
          'Content-Length': bytes.byteLength,
          'Cache-Control': 'private, max-age=31536000, immutable',
        });
        context.response.end(bytes);
      },
    ),
  ] as const;
}
