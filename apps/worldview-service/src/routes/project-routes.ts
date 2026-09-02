import {
  CreateHostedMapRequestSchema,
  CreateHostedProjectRequestSchema,
  HostedMapCreatedResponseSchema,
  HostedProjectCreatedResponseSchema,
  HostedProjectMembersResponseSchema,
  HostedProjectResponseSchema,
  HostedProjectsResponseSchema,
  SetProjectMemberRoleRequestSchema,
} from '@worldview/protocol';

import { canEditProject } from '../access-policy.js';
import {
  allowMutation,
  MAX_HOSTED_MAP_BYTES,
  requestBody,
  requireUser,
  sendError,
  sendJson,
  sendOk,
} from '../service-http.js';
import { defineRoute, pathParameter } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

const EMPTY_MAP = '{\n"classname" "worldspawn"\n}\n';

export function createProjectRoutes(options: Pick<WorldviewServiceOptions, 'database' | 'maps'>) {
  return [
    defineRoute('list-projects', 'GET', '/api/projects', (context) => {
      const user = requireUser(context, options.database);
      if (!user) return;
      sendJson(context.response, 200, HostedProjectsResponseSchema, {
        projects: [...options.database.listProjects(user.id)],
      });
    }),
    defineRoute('create-project', 'POST', '/api/projects', async (context) => {
      if (!allowMutation(context)) return;
      const user = requireUser(context, options.database);
      if (!user) return;
      const input = await requestBody(context.request, CreateHostedProjectRequestSchema);
      sendJson(context.response, 201, HostedProjectCreatedResponseSchema, {
        project: options.database.createProject(user.id, input.name, input.game),
      });
    }),
    defineRoute('get-project', 'GET', /^\/api\/projects\/([^/]+)$/, (context, match) => {
      const user = requireUser(context, options.database);
      if (!user) return;
      const project = options.database.project(pathParameter(match, 0), user.id);
      if (!project) return sendError(context.response, 404, 'Project not found');
      sendJson(context.response, 200, HostedProjectResponseSchema, {
        project: { ...project, maps: [...project.maps] },
      });
    }),
    defineRoute(
      'list-project-members',
      'GET',
      /^\/api\/projects\/([^/]+)\/members$/,
      (context, match) => {
        const user = requireUser(context, options.database);
        if (!user) return;
        const users = options.database.listProjectAccess(pathParameter(match, 0), user.id);
        if (!users) return sendError(context.response, 403, 'Project owner access required');
        sendJson(context.response, 200, HostedProjectMembersResponseSchema, { users: [...users] });
      },
    ),
    defineRoute(
      'set-project-member-role',
      'PUT',
      /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const input = await requestBody(context.request, SetProjectMemberRoleRequestSchema);
        const updated = options.database.setProjectMemberRole(
          pathParameter(match, 0),
          user.id,
          pathParameter(match, 1),
          input.role,
        );
        if (!updated) return sendError(context.response, 403, 'Project owner access required');
        sendOk(context.response);
      },
    ),
    defineRoute(
      'remove-project-member',
      'DELETE',
      /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/,
      (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const removed = options.database.removeProjectMember(
          pathParameter(match, 0),
          user.id,
          pathParameter(match, 1),
        );
        if (!removed) return sendError(context.response, 403, 'Project owner access required');
        sendOk(context.response);
      },
    ),
    defineRoute(
      'create-map',
      'POST',
      /^\/api\/projects\/([^/]+)\/maps$/,
      async (context, match) => {
        if (!allowMutation(context)) return;
        const user = requireUser(context, options.database);
        if (!user) return;
        const projectId = pathParameter(match, 0);
        if (!canEditProject(options.database.role(projectId, user.id))) {
          return sendError(context.response, 403, 'Editor access required');
        }
        const input = await requestBody(
          context.request,
          CreateHostedMapRequestSchema,
          MAX_HOSTED_MAP_BYTES + 1024,
        );
        if (options.database.hasMapNamed(projectId, input.name)) {
          return sendError(context.response, 409, 'A map with this name already exists');
        }
        const mapId = options.database.createMapId();
        // The cell remains unreachable unless the metadata insert succeeds. Predictable database
        // errors are checked above; an orphan cell is safer than visible metadata without a source.
        const snapshot = await options.maps.initialize(mapId, input.source ?? EMPTY_MAP);
        const map = options.database.createMap({
          id: mapId,
          projectId,
          userId: user.id,
          name: input.name,
          format: input.format,
        });
        sendJson(context.response, 201, HostedMapCreatedResponseSchema, {
          map: { ...map, ...snapshot },
        });
      },
    ),
  ] as const;
}
