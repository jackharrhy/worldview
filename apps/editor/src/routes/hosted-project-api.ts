export interface HostedSessionUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
}

export interface HostedProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly game: 'quake' | 'goldsrc';
  readonly role: 'owner' | 'editor' | 'viewer';
  readonly updatedAt: number;
}

export interface HostedProjectMap {
  readonly id: string;
  readonly name: string;
  readonly format: 'valve-220' | 'quake';
  readonly updated_at: number;
}

export interface HostedProject extends HostedProjectSummary {
  readonly maps: readonly HostedProjectMap[];
}

export interface HostedMapLaunch {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly game: 'quake' | 'goldsrc';
  readonly name: string;
  readonly format: 'valve-220' | 'quake';
  readonly mapVersion: number;
  readonly role: 'owner' | 'editor' | 'viewer';
  readonly actorId: string;
  readonly displayName: string;
  readonly source: string;
  readonly resources?: readonly {
    readonly name: string;
    readonly kind: string;
    readonly data: ArrayBuffer;
  }[];
}

export async function apiJson<T>(request: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(request, init);
  const payload = (await response.json().catch(() => null)) as ({ error?: unknown } & T) | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`,
    );
  return payload as T;
}

export async function authenticatedApiJson<T>(
  routeRequest: Request,
  request: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(request, init);
  if (response.status === 401) {
    const route = new URL(routeRequest.url);
    const returnTo = `${route.pathname}${route.search}`;
    throw redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const payload = (await response.json().catch(() => null)) as ({ error?: unknown } & T) | null;
  if (!response.ok)
    throw new Error(
      typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status})`,
    );
  return payload as T;
}
import { redirect } from 'react-router';
