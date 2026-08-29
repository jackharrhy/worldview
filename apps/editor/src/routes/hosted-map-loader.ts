import { apiJson, type HostedMapLaunch } from './hosted-project-api.js';

export async function loader({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  if (!params.projectId || !params.mapId)
    throw new Response('Project and map IDs required', { status: 400 });
  const { map } = await apiJson<{ map: HostedMapLaunch }>(
    new URL(`/api/maps/${encodeURIComponent(params.mapId)}`, request.url),
  );
  if (map.projectId !== params.projectId)
    throw new Response('Map does not belong to this project', { status: 404 });
  const { mounts } = await apiJson<{
    mounts: readonly { id: string; kind: string; display_name: string }[];
  }>(
    new URL(
      `/api/projects/${encodeURIComponent(params.projectId)}/resources?mapId=${encodeURIComponent(params.mapId)}`,
      request.url,
    ),
  );
  const resources = await Promise.all(
    mounts.map(async (mount) => {
      const response = await fetch(
        new URL(
          `/api/projects/${encodeURIComponent(params.projectId!)}/resources/${encodeURIComponent(mount.id)}/content?mapId=${encodeURIComponent(params.mapId!)}`,
          request.url,
        ),
      );
      if (!response.ok)
        throw new Error(`Cannot load pinned resource ${mount.display_name} (${response.status})`);
      return {
        name: mount.display_name,
        kind: mount.kind,
        data: await response.arrayBuffer(),
      };
    }),
  );
  // Data-mode loaders execute in this browser SPA; the cast prevents React Router's
  // server-serialization helper from erasing ArrayBuffer methods that remain present at runtime.
  return { map: { ...map, resources } as HostedMapLaunch };
}
