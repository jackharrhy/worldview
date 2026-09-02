import {
  HostedAssetSearchResponseSchema,
  HostedResourceMountedResponseSchema,
  HostedResourceMountsResponseSchema,
  MountHostedAssetRequestSchema,
} from '@worldview/protocol';

import { allowMutation, requestBody, requireUser, sendError, sendJson } from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

export function createResourceRoutes(
  options: Pick<WorldviewServiceOptions, 'artbin' | 'blobs' | 'database'>,
) {
  return [
    defineRoute('search-assets', 'GET', '/api/assets/search', async (context) => {
      const user = requireUser(context, options.database);
      if (!user) return;
      if (!options.artbin) {
        return sendError(context.response, 503, 'Artbin integration is not configured');
      }
      const parameters = new URLSearchParams();
      for (const key of ['q', 'kind', 'folderId', 'tag', 'cursor', 'limit']) {
        const value = context.url.searchParams.get(key);
        if (value) parameters.set(key, value);
      }
      sendJson(
        context.response,
        200,
        HostedAssetSearchResponseSchema,
        await options.artbin.search(parameters),
      );
    }),
    defineRoute(
      'list-project-resources',
      'GET',
      /^\/api\/projects\/([^/]+)\/resources$/,
      (context, match) => {
        const user = requireUser(context, options.database);
        if (!user) return;
        const mounts = options.database.listResourceMounts(pathParameter(match, 0), user.id);
        if (!mounts) return sendError(context.response, 404, 'Project not found');
        sendJson(context.response, 200, HostedResourceMountsResponseSchema, {
          mounts: [...mounts],
        });
      },
    ),
    defineRoute(
      'mount-project-resource',
      'POST',
      /^\/api\/projects\/([^/]+)\/resources$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const projectId = pathParameter(match, 0);
        if (options.database.role(projectId, user.id) !== 'owner') {
          return sendError(context.response, 403, 'Owner access required');
        }
        if (!options.artbin) {
          return sendError(context.response, 503, 'Artbin integration is not configured');
        }
        const { assetId } = await requestBody(context.request, MountHostedAssetRequestSchema);
        const { asset } = await options.artbin.metadata(assetId);
        if (!asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
          return sendError(context.response, 422, 'Artbin asset has no stable SHA-256');
        }
        const bytes = await options.artbin.content(asset.id, asset.sha256);
        await options.blobs.put(bytes);
        const mount = options.database.createResourceMount({
          projectId,
          userId: user.id,
          providerAssetId: asset.id,
          expectedSha256: asset.sha256,
          kind: asset.kind,
          displayName: asset.name,
          metadata: { mimeType: asset.mimeType, size: asset.size },
        });
        if (!mount) return sendError(context.response, 403, 'Owner access required');
        sendJson(context.response, 201, HostedResourceMountedResponseSchema, { mount });
      },
    ),
    defineRoute(
      'get-project-resource-content',
      'GET',
      /^\/api\/projects\/([^/]+)\/resources\/([^/]+)\/content$/,
      async (context, match) => {
        const user = requireUser(context, options.database);
        if (!user) return;
        const mount = options.database.resourceMount(
          pathParameter(match, 0),
          pathParameter(match, 1),
          user.id,
        );
        if (!mount) return sendError(context.response, 404, 'Resource not found');
        const bytes = await options.blobs.get(mount.expectedSha256);
        if (!bytes) return sendError(context.response, 503, 'Pinned resource cache is unavailable');
        context.response.writeHead(200, {
          'Content-Type':
            typeof mount.metadata.mimeType === 'string'
              ? mount.metadata.mimeType
              : 'application/octet-stream',
          'Content-Length': bytes.byteLength,
          'Cache-Control': 'private, max-age=31536000, immutable',
          ETag: `"${mount.expectedSha256}"`,
        });
        context.response.end(bytes);
      },
    ),
  ] as const;
}
