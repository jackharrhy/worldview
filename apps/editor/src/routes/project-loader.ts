import {
  HostedAssetSearchResponseSchema,
  HostedProjectMembersResponseSchema,
  HostedProjectResponseSchema,
  HostedResourceMountsResponseSchema,
} from '@worldview/protocol';
import { authenticatedApiJson } from './hosted-project-api.js';
import { hostedIdFromRouteReference } from './hosted-route.js';

export async function loader({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  const routeProjectId = hostedIdFromRouteReference(params.projectRef);
  if (!routeProjectId) throw new Response('Valid project reference required', { status: 400 });
  const projectId = encodeURIComponent(routeProjectId);
  const url = new URL(request.url);
  const query = url.searchParams.get('assets')?.trim() ?? '';
  const [projectResult, resourceResult, assetResult] = await Promise.all([
    authenticatedApiJson(
      HostedProjectResponseSchema,
      request,
      new URL(`/api/projects/${projectId}`, request.url),
    ),
    authenticatedApiJson(
      HostedResourceMountsResponseSchema,
      request,
      new URL(`/api/projects/${projectId}/resources`, request.url),
    ),
    query
      ? authenticatedApiJson(
          HostedAssetSearchResponseSchema,
          request,
          new URL(`/api/assets/search?q=${encodeURIComponent(query)}`, request.url),
        ).catch(() => ({ assets: [], nextCursor: null }))
      : Promise.resolve({ assets: [], nextCursor: null }),
  ]);
  const accessUsers =
    projectResult.project.role === 'owner'
      ? (
          await authenticatedApiJson(
            HostedProjectMembersResponseSchema,
            request,
            new URL(`/api/projects/${projectId}/members`, request.url),
          )
        ).users
      : [];
  return {
    ...projectResult,
    mounts: resourceResult.mounts,
    assets: assetResult.assets,
    assetQuery: query,
    accessUsers,
  };
}
