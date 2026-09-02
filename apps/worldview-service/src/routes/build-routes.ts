import {
  CreateHostedBuildRequestSchema,
  HostedBuildCreatedResponseSchema,
  HostedBuildsResponseSchema,
} from '@worldview/protocol';

import { canEditProject } from '../access-policy.js';
import {
  allowMutation,
  MAX_HOSTED_MAP_BYTES,
  requestBody,
  requireUser,
  sendError,
  sendJson,
  type ServiceRequestContext,
} from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

const BUILD_ADMISSION_REJECTIONS = {
  'user-active': { retryAfter: '30', message: 'Wait for your current build to finish' },
  'user-hourly': { retryAfter: '3600', message: 'Build limit reached; try again later' },
  'global-capacity': { retryAfter: '30', message: 'The build worker is at capacity' },
} as const;

function rejectBuildAdmission(
  context: ServiceRequestContext,
  admission: keyof typeof BUILD_ADMISSION_REJECTIONS,
): void {
  const rejection = BUILD_ADMISSION_REJECTIONS[admission];
  context.response.setHeader('Retry-After', rejection.retryAfter);
  sendError(context.response, 429, rejection.message);
}

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
        capability: options.builds?.supports(map.game) ? { profileId: 'default' } : null,
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
        if (!options.builds) {
          return sendError(context.response, 503, 'Remote builds are not configured');
        }
        const map = options.database.map(pathParameter(match, 0), user.id);
        if (!map || !canEditProject(map.role)) {
          return sendError(context.response, 403, 'Editor access required');
        }
        if (!options.builds.supports(map.game)) {
          return sendError(context.response, 503, `No ${map.game} build worker is configured`);
        }
        const input = await requestBody(context.request, CreateHostedBuildRequestSchema);
        const snapshot = await options.maps.snapshot(map.id);
        if (
          input.expectedMapVersion !== undefined &&
          input.expectedMapVersion !== snapshot.mapVersion
        ) {
          return sendError(
            context.response,
            409,
            'The hosted map has not saved this revision yet; wait a moment and try again',
          );
        }
        if (new TextEncoder().encode(snapshot.source).byteLength > MAX_HOSTED_MAP_BYTES) {
          return sendError(context.response, 413, 'Hosted builds are limited to 2 MiB map sources');
        }
        const admission = options.database.buildAdmission(user.id);
        if (admission !== 'allowed') return rejectBuildAdmission(context, admission);
        const build = options.database.createBuild({
          mapId: map.id,
          userId: user.id,
          mapVersion: snapshot.mapVersion,
          profileId: 'default',
          quality: input.quality,
        });
        const queued = options.builds.enqueue({
          id: build.id,
          game: map.game,
          mapName: map.name,
          source: snapshot.source,
          mapVersion: snapshot.mapVersion,
          sourceSha256: snapshot.sourceSha256,
          profileId: 'default',
          quality: input.quality,
          assets: [],
        });
        if (!queued) {
          options.database.updateBuild(build.id, 'failed', { error: 'Build queue is full' });
          context.response.setHeader('Retry-After', '30');
          return sendError(context.response, 429, 'The build queue is full');
        }
        sendJson(context.response, 202, HostedBuildCreatedResponseSchema, { build });
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
