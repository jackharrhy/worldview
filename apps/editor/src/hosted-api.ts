import { HostedErrorResponseSchema } from '@worldview/protocol';
import type { z } from 'zod';

export async function decodeHostedResponse<T>(
  response: Response,
  responseSchema: z.ZodType<T>,
): Promise<T> {
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
  return decodeHostedResponse(await fetch(request, init), responseSchema);
}
