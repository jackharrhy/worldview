import { apiJson } from './hosted-project-api.js';

export async function action({
  request,
  params,
}: {
  readonly request: Request;
  readonly params: Record<string, string | undefined>;
}) {
  const projectId = params.projectId;
  if (!projectId) throw new Response('Project ID required', { status: 400 });
  const data = await request.formData();
  if (data.get('intent') === 'share-map') {
    const mapId = String(data.get('mapId') ?? '');
    const role = data.get('role') === 'editor' ? 'editor' : 'viewer';
    try {
      const result = await apiJson<{ share: { token: string } }>(
        new URL(`/api/projects/${encodeURIComponent(projectId)}/shares`, request.url),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mapId, role }),
        },
      );
      const origin = new URL(request.url).origin;
      return {
        shareLink: `${origin}/shared/${encodeURIComponent(projectId)}/maps/${encodeURIComponent(mapId)}#token=${encodeURIComponent(result.share.token)}`,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  if (data.get('intent') === 'mount-asset') {
    try {
      const result = await apiJson<{ mount: { id: string } }>(
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
    const result = await apiJson<{ map: { id: string } }>(
      new URL(`/api/projects/${encodeURIComponent(projectId)}/maps`, request.url),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, format }),
      },
    );
    return { createdMapId: result.map.id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
