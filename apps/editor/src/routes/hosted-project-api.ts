import {
  HostedErrorResponseSchema,
  HostedMapLaunchSchema as HostedMapLaunchWireSchema,
} from '@worldview/protocol';
import { data, redirectDocument } from 'react-router';
import { z } from 'zod';

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

async function decodeResponse<T>(response: Response, responseSchema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = HostedErrorResponseSchema.safeParse(payload);
    throw new Error(error.success ? error.data.error : `Request failed (${response.status})`);
  }
  const result = responseSchema.safeParse(payload);
  if (!result.success) throw new Error('The hosted service returned an invalid response');
  return result.data;
}

export async function apiJson<T>(
  responseSchema: z.ZodType<T>,
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  return decodeResponse(await fetch(request, init), responseSchema);
}

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
    return await decodeResponse(response, responseSchema);
  } catch (error) {
    const message = error instanceof Error ? error.message : `Request failed (${response.status})`;
    throw data(message, {
      status: response.ok ? 502 : response.status,
      statusText: response.statusText,
    });
  }
}
