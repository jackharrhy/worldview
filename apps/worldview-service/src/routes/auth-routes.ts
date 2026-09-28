import { HostedHealthResponseSchema, HostedSessionResponseSchema } from '@worldview/protocol';
import { z } from 'zod';

import {
  allowMutation,
  AUTOMATION_COOKIE,
  cookie,
  OAUTH_COOKIE,
  publicSessionUser,
  redirect,
  requestBody,
  sendError,
  sendJson,
  sendOk,
  sessionUser,
  SESSION_COOKIE,
  setCookie,
} from '../service-http.js';
import { defineRoute } from '../service-routing.js';
import {
  beginAuthorization,
  completeAuthorization,
  consumeAuthorizationTransaction,
} from '../oauth.js';
import type { WorldviewServiceOptions } from '../service-options.js';

export function createAuthRoutes(
  options: Pick<WorldviewServiceOptions, 'database' | 'fetch' | 'oauth'>,
) {
  return [
    defineRoute('health', 'GET', '/health', ({ response }) => {
      sendJson(response, 200, HostedHealthResponseSchema, { status: 'ok' });
    }),
    defineRoute(
      'oauth-login',
      'GET',
      '/auth/login',
      ({ response, secureCookies, url, publicOrigin }) => {
        const auth = beginAuthorization(
          options.database,
          { ...options.oauth, publicUrl: publicOrigin },
          url.searchParams.get('returnTo') ?? '/',
        );
        setCookie(response, OAUTH_COOKIE, auth.state, 600, secureCookies);
        redirect(response, auth.url);
      },
    ),
    defineRoute(
      'oauth-callback',
      'GET',
      '/auth/callback',
      async ({ request, response, secureCookies, url, publicOrigin }) => {
        const cookieState = cookie(request, OAUTH_COOKIE);
        setCookie(response, OAUTH_COOKIE, '', 0, secureCookies);
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');
        if (error) {
          if (!state) return sendError(response, 400, 'OAuth state is required');
          consumeAuthorizationTransaction({ database: options.database, state, cookieState });
          return redirect(response, `/?authError=${encodeURIComponent(error)}`);
        }
        const code = url.searchParams.get('code');
        if (!state || !code) return sendError(response, 400, 'OAuth code and state are required');
        const completed = await completeAuthorization({
          database: options.database,
          config: { ...options.oauth, publicUrl: publicOrigin },
          state,
          code,
          cookieState,
          fetch: options.fetch ?? globalThis.fetch,
        });
        const session = options.database.createSession(completed.user.id);
        setCookie(
          response,
          SESSION_COOKIE,
          session.token,
          (session.expiresAt - Date.now()) / 1000,
          secureCookies,
        );
        return redirect(response, completed.returnTo);
      },
    ),
    defineRoute('logout', 'POST', '/auth/logout', (context) => {
      if (!allowMutation(context)) return;
      const { request, response, secureCookies } = context;
      options.database.deleteSession(cookie(request, SESSION_COOKIE));
      setCookie(response, SESSION_COOKIE, '', 0, secureCookies);
      sendOk(response);
    }),
    defineRoute('session', 'GET', '/api/session', (context) => {
      sendJson(context.response, 200, HostedSessionResponseSchema, {
        user: publicSessionUser(sessionUser(context, options.database)),
      });
    }),
    defineRoute('automation-redeem', 'POST', '/api/automation/redeem', async (context) => {
      if (!allowMutation(context)) return;
      const input = await requestBody(
        context.request,
        z.strictObject({ code: z.string().min(32).max(256) }),
      );
      const grant = options.database.redeemAutomationGrant(input.code);
      if (!grant) return sendError(context.response, 401, 'Browser grant is invalid or expired');
      setCookie(
        context.response,
        AUTOMATION_COOKIE,
        grant.token,
        (grant.expiresAt - Date.now()) / 1000,
        context.secureCookies,
      );
      sendJson(
        context.response,
        200,
        z.strictObject({ projectId: z.string(), expiresAt: z.number() }),
        {
          projectId: grant.projectId,
          expiresAt: grant.expiresAt,
        },
      );
    }),
  ] as const;
}
