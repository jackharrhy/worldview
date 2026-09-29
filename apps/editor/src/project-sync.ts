import {
  HostedMapResponseSchema,
  HostedProjectResponseSchema,
  ReplaceHostedMapSourceResultSchema,
  type HostedMapSnapshot,
} from '@worldview/protocol';
import { saveMapFile } from './project-files.js';
import { mapSourceFingerprint } from '@jackharrhy/worldview-editor/core';
import { EDITOR_STORES, openEditorDatabase } from './editor-database.js';
import type { WorldviewProjectWorkspace } from './project-workspace.js';

export interface ProjectSyncBaseline {
  readonly key: string;
  readonly localSha256: string;
  readonly hostedSha256: string;
  readonly hostedMapVersion: number;
  readonly source: string;
  readonly updatedAt: number;
}

export type ProjectSyncStatus =
  | 'in-sync'
  | 'first-link'
  | 'local-changed'
  | 'hosted-changed'
  | 'conflict';

export interface ProjectSyncInspection {
  readonly projectId: string;
  readonly path: string;
  readonly mapId: string;
  readonly localSource: string;
  readonly hostedSource: string;
  readonly localSha256: string;
  readonly hosted: HostedMapSnapshot;
  readonly baseline: ProjectSyncBaseline | null;
  readonly status: ProjectSyncStatus;
}

export class ProjectSyncConflictError extends Error {
  public constructor(
    message = 'The map changed while syncing. Review the latest diff and try again.',
  ) {
    super(message);
  }
}

async function sha256(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Hosted request failed (${response.status})`);
  }
  return response.json();
}

export class LinkedProjectSync {
  public constructor(private readonly workspace: WorldviewProjectWorkspace) {
    const link = workspace.manifest.hosted;
    if (!link) throw new Error('This project has no hosted link');
    for (const entry of link.maps) {
      if (!workspace.maps.some((map) => map.path === entry.path))
        throw new Error(`Linked map is missing from the local project: ${entry.path}`);
    }
  }

  private get link() {
    return this.workspace.manifest.hosted!;
  }

  private checkOrigin(): void {
    if (this.link.origin !== location.origin)
      throw new Error(`Open this project at ${this.link.origin} to sync with its hosted maps.`);
  }

  private key(path: string, mapId: string): string {
    return `${this.link.origin}:${this.link.projectId}:${mapId}:${path}`;
  }

  private async hostedMap(mapId: string): Promise<HostedMapSnapshot> {
    const response = await fetch(`/api/maps/${encodeURIComponent(mapId)}`, {
      credentials: 'same-origin',
    });
    const { map } = HostedMapResponseSchema.parse(await responseJson(response));
    if (map.projectId !== this.link.projectId)
      throw new Error('Linked map belongs to another hosted project');
    if (map.game !== this.workspace.manifest.game)
      throw new Error('Local and hosted project games differ');
    return map;
  }

  public async verifyProject(): Promise<void> {
    this.checkOrigin();
    const response = await fetch(`/api/projects/${encodeURIComponent(this.link.projectId)}`, {
      credentials: 'same-origin',
    });
    const { project } = HostedProjectResponseSchema.parse(await responseJson(response));
    if (project.game !== this.workspace.manifest.game)
      throw new Error('Local and hosted project games differ');
  }

  public async inspect(path: string): Promise<ProjectSyncInspection> {
    this.checkOrigin();
    const entry = this.link.maps.find((candidate) => candidate.path === path);
    const local = this.workspace.maps.find((candidate) => candidate.path === path);
    if (!entry || !local) throw new Error(`Map is not linked: ${path}`);
    const [localSource, hosted, baseline] = await Promise.all([
      local.handle.getFile().then((file) => file.text()),
      this.hostedMap(entry.mapId),
      openEditorDatabase().then((database) =>
        database.get(EDITOR_STORES.projectSync, this.key(path, entry.mapId)),
      ),
    ]);
    const localSha256 = await sha256(localSource);
    const stored = baseline ?? null;
    const localChanged = stored !== null && localSha256 !== stored.localSha256;
    const hostedChanged = stored !== null && hosted.sourceSha256 !== stored.hostedSha256;
    const status: ProjectSyncStatus =
      localSha256 === hosted.sourceSha256
        ? 'in-sync'
        : !stored
          ? 'first-link'
          : localChanged && hostedChanged
            ? 'conflict'
            : localChanged
              ? 'local-changed'
              : hostedChanged
                ? 'hosted-changed'
                : 'conflict';
    if (status === 'in-sync' && (!stored || stored.hostedMapVersion !== hosted.mapVersion))
      await this.remember(path, entry.mapId, localSha256, hosted, localSource);
    return {
      projectId: this.link.projectId,
      path,
      mapId: entry.mapId,
      localSource,
      hostedSource: hosted.source,
      localSha256,
      hosted,
      baseline: stored,
      status,
    };
  }

  private async remember(
    path: string,
    mapId: string,
    localSha256: string,
    hosted: HostedMapSnapshot,
    source: string,
  ): Promise<void> {
    await (
      await openEditorDatabase()
    ).put(EDITOR_STORES.projectSync, {
      key: this.key(path, mapId),
      localSha256,
      hostedSha256: hosted.sourceSha256,
      hostedMapVersion: hosted.mapVersion,
      source,
      updatedAt: Date.now(),
    });
  }

  public async pull(reviewed: ProjectSyncInspection): Promise<void> {
    const current = await this.inspect(reviewed.path);
    if (
      current.localSha256 !== reviewed.localSha256 ||
      current.hosted.sourceSha256 !== reviewed.hosted.sourceSha256 ||
      current.hosted.mapVersion !== reviewed.hosted.mapVersion
    )
      throw new ProjectSyncConflictError();
    const local = this.workspace.maps.find((map) => map.path === reviewed.path)!;
    await saveMapFile(
      local.handle,
      mapSourceFingerprint(reviewed.localSource),
      reviewed.hostedSource,
    );
    await this.remember(
      reviewed.path,
      reviewed.mapId,
      current.hosted.sourceSha256,
      current.hosted,
      current.hostedSource,
    );
  }

  public async push(reviewed: ProjectSyncInspection): Promise<void> {
    const current = await this.inspect(reviewed.path);
    if (
      current.localSha256 !== reviewed.localSha256 ||
      current.hosted.sourceSha256 !== reviewed.hosted.sourceSha256 ||
      current.hosted.mapVersion !== reviewed.hosted.mapVersion
    )
      throw new ProjectSyncConflictError();
    const response = await fetch(
      `/api/projects/${encodeURIComponent(this.link.projectId)}/maps/${encodeURIComponent(reviewed.mapId)}/source`,
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedMapVersion: reviewed.hosted.mapVersion,
          expectedSourceSha256: reviewed.hosted.sourceSha256,
          source: reviewed.localSource,
        }),
      },
    );
    if (response.status === 409) throw new ProjectSyncConflictError();
    const result = ReplaceHostedMapSourceResultSchema.parse(await responseJson(response));
    if (result.status !== 'replaced') throw new ProjectSyncConflictError();
    await this.remember(
      reviewed.path,
      reviewed.mapId,
      reviewed.localSha256,
      result.map,
      reviewed.localSource,
    );
  }
}
