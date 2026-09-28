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
  const section = url.pathname.endsWith('/access')
    ? 'access'
    : url.pathname.endsWith('/resources')
      ? 'resources'
      : url.pathname.endsWith('/new-map')
        ? 'new-map'
        : 'maps';
  const query = url.searchParams.get('assets')?.trim() ?? '';
  const [projectResult, resourceResult, assetResult] = await Promise.all([
    authenticatedApiJson(
      HostedProjectResponseSchema,
      request,
      new URL(`/api/projects/${projectId}`, request.url),
    ),
    section === 'resources'
      ? authenticatedApiJson(
          HostedResourceMountsResponseSchema,
          request,
          new URL(`/api/projects/${projectId}/resources`, request.url),
        )
      : Promise.resolve({ mounts: [] }),
    section === 'resources' && query
      ? authenticatedApiJson(
          HostedAssetSearchResponseSchema,
          request,
          new URL(`/api/assets/search?q=${encodeURIComponent(query)}`, request.url),
        ).catch(() => ({ assets: [], nextCursor: null }))
      : Promise.resolve({ assets: [], nextCursor: null }),
  ]);
  const canEdit = projectResult.project.role === 'owner' || projectResult.project.role === 'editor';
  if (
    (section === 'new-map' && !canEdit) ||
    (section === 'access' && projectResult.project.role !== 'owner')
  )
    throw new Response('Project access denied', { status: 403 });
  const accessUsers =
    section === 'access'
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
    section,
    mounts: resourceResult.mounts,
    assets: assetResult.assets,
    assetQuery: query,
    accessUsers,
  };
}
