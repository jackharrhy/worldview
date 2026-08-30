import { authenticatedApiJson, type HostedMapLaunch } from './hosted-project-api.js';
import { hostedIdFromRouteReference } from './hosted-route.js';

export async function loader({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  const projectId = hostedIdFromRouteReference(params.projectRef);
  const mapId = hostedIdFromRouteReference(params.mapRef);
  if (!projectId || !mapId)
    throw new Response('Valid project and map references required', { status: 400 });
  const { map } = await authenticatedApiJson<{ map: HostedMapLaunch }>(
    request,
    new URL(`/api/maps/${encodeURIComponent(mapId)}`, request.url),
  );
  if (map.projectId !== projectId)
    throw new Response('Map does not belong to this project', { status: 404 });
  const { mounts } = await authenticatedApiJson<{
    mounts: readonly { id: string; kind: string; display_name: string }[];
  }>(
    request,
    new URL(
      `/api/projects/${encodeURIComponent(projectId)}/resources?mapId=${encodeURIComponent(mapId)}`,
      request.url,
    ),
  );
  const resources = await Promise.all(
    mounts.map(async (mount) => {
      const response = await fetch(
        new URL(
          `/api/projects/${encodeURIComponent(projectId)}/resources/${encodeURIComponent(mount.id)}/content?mapId=${encodeURIComponent(mapId)}`,
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
