import {
  authenticatedApiJson,
  type HostedProject,
  type HostedProjectAccessUser,
} from './hosted-project-api.js';

export async function loader({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  if (!params.projectId) throw new Response('Project ID required', { status: 400 });
  const projectId = encodeURIComponent(params.projectId);
  const url = new URL(request.url);
  const query = url.searchParams.get('assets')?.trim() ?? '';
  const [projectResult, resourceResult, assetResult] = await Promise.all([
    authenticatedApiJson<{ project: HostedProject }>(
      request,
      new URL(`/api/projects/${projectId}`, request.url),
    ),
    authenticatedApiJson<{ mounts: readonly Record<string, unknown>[] }>(
      request,
      new URL(`/api/projects/${projectId}/resources`, request.url),
    ),
    query
      ? authenticatedApiJson<{
          assets: readonly {
            id: string;
            name: string;
            kind: string;
            size: number;
            sha256: string | null;
          }[];
        }>(
          request,
          new URL(`/api/assets/search?q=${encodeURIComponent(query)}`, request.url),
        ).catch(() => ({ assets: [] }))
      : Promise.resolve({ assets: [] }),
  ]);
  const accessUsers =
    projectResult.project.role === 'owner'
      ? (
          await authenticatedApiJson<{ users: readonly HostedProjectAccessUser[] }>(
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
