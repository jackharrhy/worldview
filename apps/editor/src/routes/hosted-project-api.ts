import { HostedMapLaunchSchema as HostedMapLaunchWireSchema } from '@worldview/protocol';
import { data, redirectDocument } from 'react-router';
import { z } from 'zod';
import { decodeHostedResponse } from '../hosted-api.js';

export { apiJson } from '../hosted-api.js';

export type {
  HostedProject,
  HostedProjectAccessUser,
  HostedProjectMap,
  HostedProjectSummary,
  HostedSessionUser,
} from '@worldview/protocol';

export const HostedMapLaunchSchema = HostedMapLaunchWireSchema.extend({
  resources: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(4_096),
        kind: z.string().min(1).max(128),
        data: z.instanceof(ArrayBuffer),
      }),
    )
    .optional(),
});
export type HostedMapLaunch = z.infer<typeof HostedMapLaunchSchema>;

export async function authenticatedApiJson<T>(
  responseSchema: z.ZodType<T>,
  routeRequest: Request,
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(request, init);
  if (response.status === 401) {
    const route = new URL(routeRequest.url);
    const returnTo = `${route.pathname}${route.search}`;
    throw redirectDocument(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  try {
    return await decodeHostedResponse(response, responseSchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Request failed (${response.status})`;
    throw data(message, {
      status: response.ok ? 502 : response.status,
      statusText: response.statusText,
    });
  }
}
