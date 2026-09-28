import {
  HostedAssetSearchResponseSchema,
  HostedResourceMountedResponseSchema,
  HostedResourceMountsResponseSchema,
  MountHostedAssetRequestSchema,
} from '@worldview/protocol';

import {
  allowMutation,
  requestBody,
  requireUser,
  sendError,
  sendJson,
  sendOk,
} from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import { RESOURCE_KINDS, resourceName } from '../resource-input.js';
import { MAX_RESOURCE_FILE_BYTES } from '../resource-limits.js';
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
        if (asset.size > MAX_RESOURCE_FILE_BYTES) {
          return sendError(
            context.response,
            413,
            'Project assets must be at most 512 MiB per file',
          );
        }
        if (!asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
          return sendError(context.response, 422, 'Artbin asset has no stable SHA-256');
        }
        const stored = await options.blobs.putStream(
          await options.artbin.contentStream(asset.id, asset.sha256),
          MAX_RESOURCE_FILE_BYTES,
        );
        if (stored.size !== asset.size || stored.sha256 !== asset.sha256) {
          return sendError(context.response, 422, 'Artbin asset size changed during import');
        }
        const mount = options.database.createResourceMount({
          projectId,
          userId: user.id,
          provider: 'artbin',
          providerAssetId: asset.id,
          expectedSha256: asset.sha256,
          kind: asset.kind,
          displayName: asset.name,
          size: stored.size,
          metadata: { mimeType: asset.mimeType, size: asset.size },
        });
        if (!mount) return sendError(context.response, 403, 'Owner access required');
        sendJson(context.response, 201, HostedResourceMountedResponseSchema, { mount });
      },
    ),
    defineRoute(
      'upload-project-resource',
      'PUT',
      /^\/api\/projects\/([^/]+)\/resources\/upload$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const projectId = pathParameter(match, 0);
        if (options.database.role(projectId, user.id) !== 'owner') {
          return sendError(context.response, 403, 'Owner access required');
        }
        const name = resourceName(context.url.searchParams.get('name'));
        const kind = context.url.searchParams.get('kind');
        if (!name || !kind || !RESOURCE_KINDS.has(kind)) {
          return sendError(context.response, 400, 'Choose a supported resource name and kind');
        }
        const declaredSize = Number(context.request.headers['content-length'] ?? 0);
        if (!Number.isSafeInteger(declaredSize) || declaredSize > MAX_RESOURCE_FILE_BYTES) {
          return sendError(
            context.response,
            413,
            'Project assets must be at most 512 MiB per file',
          );
        }
        const stored = await options.blobs.putStream(context.request, MAX_RESOURCE_FILE_BYTES);
        const mount = options.database.createResourceMount({
          projectId,
          userId: user.id,
          provider: 'upload',
          providerAssetId: stored.sha256,
          expectedSha256: stored.sha256,
          kind,
          displayName: name,
          size: stored.size,
          metadata: {
            mimeType: context.request.headers['content-type'] ?? 'application/octet-stream',
          },
        });
        if (!mount) return sendError(context.response, 403, 'Owner access required');
        sendJson(context.response, 201, HostedResourceMountedResponseSchema, { mount });
      },
    ),
    defineRoute(
      'delete-project-resource',
      'DELETE',
      /^\/api\/projects\/([^/]+)\/resources\/([^/]+)$/,
      (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        if (
          !options.database.deleteResourceMount(
            pathParameter(match, 0),
            pathParameter(match, 1),
            user.id,
          )
        )
          return sendError(context.response, 403, 'Owner access required');
        sendOk(context.response);
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
        const opened = await options.blobs.openStream(mount.expectedSha256);
        if (!opened)
          return sendError(context.response, 503, 'Pinned resource cache is unavailable');
        context.response.writeHead(200, {
          'Content-Type':
            typeof mount.metadata.mimeType === 'string'
              ? mount.metadata.mimeType
              : 'application/octet-stream',
          'Content-Length': opened.size,
          'Cache-Control': 'private, max-age=31536000, immutable',
          ETag: `"${mount.expectedSha256}"`,
        });
        opened.body.on('error', (error) => context.response.destroy(error));
        opened.body.pipe(context.response);
      },
    ),
  ] as const;
}
