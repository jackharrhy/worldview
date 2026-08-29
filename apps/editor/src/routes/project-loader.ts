import { apiJson, type HostedProject } from './hosted-project-api.js';

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
    apiJson<{ project: HostedProject }>(new URL(`/api/projects/${projectId}`, request.url)),
    apiJson<{ mounts: readonly Record<string, unknown>[] }>(
      new URL(`/api/projects/${projectId}/resources`, request.url),
    ),
    query
      ? apiJson<{
          assets: readonly {
            id: string;
            name: string;
            kind: string;
            size: number;
            sha256: string | null;
          }[];
        }>(new URL(`/api/assets/search?q=${encodeURIComponent(query)}`, request.url)).catch(() => ({
          assets: [],
        }))
      : Promise.resolve({ assets: [] }),
  ]);
  return {
    ...projectResult,
    mounts: resourceResult.mounts,
    assets: assetResult.assets,
    assetQuery: query,
  };
}
