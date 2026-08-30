import { ProjectLocalStateService } from '../project-local-state.js';
import { HostedProjectsResponseSchema, HostedSessionResponseSchema } from '@worldview/protocol';
import { apiJson } from './hosted-project-api.js';

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
    const { user } = await apiJson(HostedSessionResponseSchema, `${origin}/api/session`);
    if (!user) return { localProjects, hosted: { status: 'signed-out' as const, projects: [] } };
    const { projects: hostedProjects } = await apiJson(
      HostedProjectsResponseSchema,
      `${origin}/api/projects`,
    );
    return { localProjects, hosted: { status: 'ready' as const, user, projects: hostedProjects } };
  } catch {
    return { localProjects, hosted: { status: 'offline' as const, projects: [] } };
  }
}
