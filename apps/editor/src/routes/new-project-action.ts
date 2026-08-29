import { redirect } from 'react-router';
import { isWorldviewGameProfile } from '@jackharrhy/worldview-editor/core';
import { apiJson, type HostedProjectSummary } from './hosted-project-api.js';

export async function action({ request }: { readonly request: Request }) {
  const data = await request.formData();
  const name = String(data.get('name') ?? '').trim();
  const game = String(data.get('game') ?? 'quake');
  if (!name) return { error: 'Enter a project name.' };
  if (!isWorldviewGameProfile(game)) return { error: 'Choose a supported game.' };
  try {
    const { project } = await apiJson<{ project: HostedProjectSummary }>(
      new URL('/api/projects', request.url),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, game }),
      },
    );
    return redirect(`/projects/${encodeURIComponent(project.id)}`);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
