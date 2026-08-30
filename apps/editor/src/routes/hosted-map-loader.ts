import { HostedMapResponseSchema, HostedResourceMountsResponseSchema } from '@worldview/protocol';
import {
  authenticatedApiJson,
  HostedMapLaunchSchema,
  type HostedMapLaunch,
} from './hosted-project-api.js';
import { hostedIdFromRouteReference } from './hosted-route.js';

export interface HostedMapLoaderData {
  readonly map: HostedMapLaunch;
}

export async function loader({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}): Promise<HostedMapLoaderData> {
  const projectId = hostedIdFromRouteReference(params.projectRef);
  const mapId = hostedIdFromRouteReference(params.mapRef);
  if (!projectId || !mapId)
    throw new Response('Valid project and map references required', { status: 400 });
  const { map } = await authenticatedApiJson(
    HostedMapResponseSchema,
    request,
    new URL(`/api/maps/${encodeURIComponent(mapId)}`, request.url),
  );
  if (map.projectId !== projectId)
    throw new Response('Map does not belong to this project', { status: 404 });
  const { mounts } = await authenticatedApiJson(
    HostedResourceMountsResponseSchema,
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
        throw new Error(`Cannot load pinned resource ${mount.displayName} (${response.status})`);
      return {
        name: mount.displayName,
        kind: mount.kind,
        data: await response.arrayBuffer(),
      };
    }),
  );
  return { map: HostedMapLaunchSchema.parse({ ...map, resources }) };
}
