import { ProjectLocalStateService } from '../project-local-state.js';
import type { HostedProjectSummary, HostedSessionUser } from './hosted-project-api.js';

const projects = new ProjectLocalStateService();

export async function loader({ request }: { readonly request: Request }) {
  const recents = await projects.list().catch(() => []);
  const localProjects = recents.map((recent) => ({
    projectKey: recent.projectKey,
    displayName: recent.displayName,
    detail: recent.lastMapPath ?? recent.handle.name,
    updatedAt: recent.updatedAt,
  }));
  const origin = new URL(request.url).origin;
  try {
    const sessionResponse = await fetch(`${origin}/api/session`);
    if (!sessionResponse.ok) throw new Error('Hosted service unavailable');
    const { user } = (await sessionResponse.json()) as { user: HostedSessionUser | null };
    if (!user) return { localProjects, hosted: { status: 'signed-out' as const, projects: [] } };
    const projectsResponse = await fetch(`${origin}/api/projects`);
    if (!projectsResponse.ok) throw new Error('Could not load hosted projects');
    const { projects: hostedProjects } = (await projectsResponse.json()) as {
      projects: HostedProjectSummary[];
    };
    return { localProjects, hosted: { status: 'ready' as const, user, projects: hostedProjects } };
  } catch {
    return { localProjects, hosted: { status: 'offline' as const, projects: [] } };
  }
}
