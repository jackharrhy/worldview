import {
  HostedMapCreatedResponseSchema,
  HostedOkResponseSchema,
  HostedResourceMountedResponseSchema,
} from '@worldview/protocol';
import { apiJson } from './hosted-project-api.js';
import { hostedIdFromRouteReference } from './hosted-route.js';

export async function action({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  const projectId = hostedIdFromRouteReference(params.projectRef);
  if (!projectId) throw new Response('Valid project reference required', { status: 400 });
  const data = await request.formData();
  const intent = String(data.get('intent') ?? '');
  if (intent === 'set-member-role' || intent === 'remove-member') {
    const userId = String(data.get('userId') ?? '');
    if (!userId) return { error: 'Choose a user.' };
    try {
      await apiJson(
        HostedOkResponseSchema,
        new URL(
          `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
          request.url,
        ),
        intent === 'remove-member'
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: String(data.get('role') ?? '') }),
            },
      );
      return { accessUpdated: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (intent === 'mount-asset') {
    try {
      const result = await apiJson(
        HostedResourceMountedResponseSchema,
        new URL(`/api/projects/${encodeURIComponent(projectId)}/resources`, request.url),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: String(data.get('assetId') ?? '') }),
        },
      );
      return { mountedAssetId: result.mount.id };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  const name = String(data.get('name') ?? '').trim();
  const format = String(data.get('format') ?? 'valve-220');
  if (!name) return { error: 'Enter a map name.' };
  if (format !== 'valve-220' && format !== 'quake')
    return { error: 'Choose a supported map format.' };
  try {
    const result = await apiJson(
      HostedMapCreatedResponseSchema,
      new URL(`/api/projects/${encodeURIComponent(projectId)}/maps`, request.url),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, format }),
      },
    );
    return { createdMap: result.map };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
