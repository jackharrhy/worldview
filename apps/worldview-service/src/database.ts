import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type ProjectRole = 'owner' | 'editor' | 'viewer';
export type ShareRole = 'editor' | 'viewer';

export interface WorldviewUser {
  readonly id: string;
  readonly fourmSub: string;
  readonly username: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
}
export interface GuestAccess {
  readonly actorId: string;
  readonly displayName: string;
  readonly role: ShareRole;
  readonly shareId: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly game: 'quake' | 'goldsrc';
  readonly role: ProjectRole;
  readonly updatedAt: number;
}

interface SqlUser {
  id: string;
  fourm_sub: string;
  username: string;
  display_name: string;
  is_admin: number;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

export class WorldviewDatabase {
  private readonly sql: DatabaseSync;

  public constructor(path: string) {
    this.sql = new DatabaseSync(path);
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  public close(): void {
    this.sql.close();
  }

  private migrate(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, fourm_sub TEXT NOT NULL UNIQUE, username TEXT NOT NULL,
        display_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS oauth_transactions (
        state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, return_to TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, game TEXT NOT NULL CHECK(game IN ('quake','goldsrc')),
        created_by TEXT NOT NULL REFERENCES users(id), archived_at INTEGER,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_members (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
        PRIMARY KEY(project_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE, name TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE(user_id, parent_id, name)
      );
      CREATE TABLE IF NOT EXISTS folder_projects (
        folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        PRIMARY KEY(folder_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL, format TEXT NOT NULL CHECK(format IN ('valve-220','quake')),
        room_id TEXT NOT NULL UNIQUE, source_blob_hash TEXT NOT NULL, source_fingerprint TEXT NOT NULL,
        room_version INTEGER NOT NULL DEFAULT 0, source_version INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(project_id, name)
      );
      CREATE TABLE IF NOT EXISTS share_links (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        map_id TEXT REFERENCES maps(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('editor','viewer')),
        created_by TEXT NOT NULL REFERENCES users(id), expires_at INTEGER, revoked_at INTEGER, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS guest_sessions (
        token_hash TEXT PRIMARY KEY, share_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL, display_name TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resource_mounts (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL, provider TEXT NOT NULL, provider_asset_id TEXT NOT NULL,
        expected_sha256 TEXT NOT NULL, kind TEXT NOT NULL, display_name TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL REFERENCES users(id),
        created_at INTEGER NOT NULL, UNIQUE(project_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS builds (
        id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
        requested_by TEXT NOT NULL REFERENCES users(id), room_version INTEGER NOT NULL,
        profile_id TEXT NOT NULL, quality TEXT NOT NULL CHECK(quality IN ('preview','final')),
        status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','cancelled')),
        source_sha256 TEXT, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS map_checkpoints (
        id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
        name TEXT NOT NULL, source_version INTEGER NOT NULL, source_blob_hash TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
      );
    `);
    const mapColumns = this.sql.prepare('PRAGMA table_info(maps)').all() as { name: string }[];
    if (!mapColumns.some(({ name }) => name === 'source_version')) {
      this.sql.exec('ALTER TABLE maps ADD COLUMN source_version INTEGER NOT NULL DEFAULT 0');
    }
  }

  public beginOauth(returnTo: string, verifier: string): { state: string; expiresAt: number } {
    const state = token();
    const expiresAt = Date.now() + 10 * 60_000;
    this.sql
      .prepare('INSERT INTO oauth_transactions VALUES (?, ?, ?, ?)')
      .run(digest(state), verifier, returnTo, expiresAt);
    return { state, expiresAt };
  }

  public consumeOauth(state: string): { verifier: string; returnTo: string } | null {
    const row = this.sql
      .prepare(
        'DELETE FROM oauth_transactions WHERE state_hash = ? AND expires_at > ? RETURNING verifier, return_to',
      )
      .get(digest(state), Date.now()) as { verifier: string; return_to: string } | undefined;
    return row ? { verifier: row.verifier, returnTo: row.return_to } : null;
  }

  public upsertUser(profile: Omit<WorldviewUser, 'id'>): WorldviewUser {
    const now = Date.now();
    const existing = this.sql
      .prepare('SELECT id FROM users WHERE fourm_sub = ?')
      .get(profile.fourmSub) as { id: string } | undefined;
    const id = existing?.id ?? randomUUID();
    this.sql
      .prepare(`
      INSERT INTO users(id, fourm_sub, username, display_name, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fourm_sub) DO UPDATE SET username=excluded.username,
      display_name=excluded.display_name, is_admin=excluded.is_admin, updated_at=excluded.updated_at
    `)
      .run(
        id,
        profile.fourmSub,
        profile.username,
        profile.displayName,
        profile.isAdmin ? 1 : 0,
        now,
        now,
      );
    return { id, ...profile };
  }

  public createSession(userId: string): { token: string; expiresAt: number } {
    const value = token();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60_000;
    this.sql
      .prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
      .run(digest(value), userId, expiresAt, Date.now());
    return { token: value, expiresAt };
  }

  public sessionUser(value: string | undefined): WorldviewUser | null {
    if (!value) return null;
    const row = this.sql
      .prepare(`
      SELECT u.id, u.fourm_sub, u.username, u.display_name, u.is_admin
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>?
    `)
      .get(digest(value), Date.now()) as SqlUser | undefined;
    return row ? this.user(row) : null;
  }

  public deleteSession(value: string | undefined): void {
    if (value) this.sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(value));
  }

  private user(row: SqlUser): WorldviewUser {
    return {
      id: row.id,
      fourmSub: row.fourm_sub,
      username: row.username,
      displayName: row.display_name,
      isAdmin: row.is_admin === 1,
    };
  }

  public createProject(userId: string, name: string, game: 'quake' | 'goldsrc'): ProjectSummary {
    const id = randomUUID();
    const now = Date.now();
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      this.sql
        .prepare('INSERT INTO projects VALUES (?, ?, ?, ?, NULL, ?, ?)')
        .run(id, name, game, userId, now, now);
      this.sql.prepare("INSERT INTO project_members VALUES (?, ?, 'owner')").run(id, userId);
      this.sql.exec('COMMIT');
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    }
    return { id, name, game, role: 'owner', updatedAt: now };
  }

  public listProjects(userId: string): readonly ProjectSummary[] {
    const rows = this.sql
      .prepare(`
      SELECT p.id, p.name, p.game, p.updated_at, m.role FROM projects p
      JOIN project_members m ON m.project_id=p.id
      WHERE m.user_id=? AND p.archived_at IS NULL ORDER BY p.updated_at DESC
    `)
      .all(userId) as {
      id: string;
      name: string;
      game: 'quake' | 'goldsrc';
      updated_at: number;
      role: ProjectRole;
    }[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      game: row.game,
      role: row.role,
      updatedAt: row.updated_at,
    }));
  }

  public role(projectId: string, userId: string): ProjectRole | null {
    const row = this.sql
      .prepare('SELECT role FROM project_members WHERE project_id=? AND user_id=?')
      .get(projectId, userId) as { role: ProjectRole } | undefined;
    return row?.role ?? null;
  }

  public project(
    projectId: string,
    userId: string,
  ): (ProjectSummary & { maps: readonly Record<string, unknown>[] }) | null {
    const role = this.role(projectId, userId);
    if (!role) return null;
    const row = this.sql
      .prepare('SELECT id,name,game,updated_at FROM projects WHERE id=? AND archived_at IS NULL')
      .get(projectId) as
      | { id: string; name: string; game: 'quake' | 'goldsrc'; updated_at: number }
      | undefined;
    if (!row) return null;
    const maps = this.sql
      .prepare(
        'SELECT id,name,format,room_id,room_version,source_version,updated_at FROM maps WHERE project_id=? ORDER BY name',
      )
      .all(projectId) as Record<string, unknown>[];
    return { id: row.id, name: row.name, game: row.game, role, updatedAt: row.updated_at, maps };
  }

  public createMap(input: {
    projectId: string;
    userId: string;
    name: string;
    format: 'valve-220' | 'quake';
    sourceHash: string;
    sourceFingerprint: string;
  }): Record<string, unknown> {
    const id = randomUUID();
    const roomId = `hosted_${randomUUID()}`;
    const now = Date.now();
    this.sql
      .prepare(`INSERT INTO maps(id,project_id,name,format,room_id,source_blob_hash,source_fingerprint,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id,
        input.projectId,
        input.name,
        input.format,
        roomId,
        input.sourceHash,
        input.sourceFingerprint,
        input.userId,
        now,
        now,
      );
    this.sql.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now, input.projectId);
    return { id, name: input.name, format: input.format, roomId, roomVersion: 0, updatedAt: now };
  }

  public map(
    mapId: string,
    userId: string,
  ): {
    readonly id: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly game: 'quake' | 'goldsrc';
    readonly name: string;
    readonly format: 'valve-220' | 'quake';
    readonly roomId: string;
    readonly roomVersion: number;
    readonly sourceHash: string;
    readonly role: ProjectRole;
    readonly sourceVersion: number;
  } | null {
    const row = this.sql
      .prepare(`
      SELECT m.id,m.project_id,m.name,m.format,m.room_id,m.room_version,m.source_version,m.source_blob_hash,
        p.name AS project_name,p.game,pm.role
      FROM maps m JOIN projects p ON p.id=m.project_id
      JOIN project_members pm ON pm.project_id=p.id
      WHERE m.id=? AND pm.user_id=? AND p.archived_at IS NULL
    `)
      .get(mapId, userId) as
      | {
          id: string;
          project_id: string;
          name: string;
          format: 'valve-220' | 'quake';
          room_id: string;
          room_version: number;
          source_version: number;
          source_blob_hash: string;
          project_name: string;
          game: 'quake' | 'goldsrc';
          role: ProjectRole;
        }
      | undefined;
    return row
      ? {
          id: row.id,
          projectId: row.project_id,
          projectName: row.project_name,
          game: row.game,
          name: row.name,
          format: row.format,
          roomId: row.room_id,
          roomVersion: row.room_version,
          sourceVersion: row.source_version,
          sourceHash: row.source_blob_hash,
          role: row.role,
        }
      : null;
  }

  public saveMapSource(input: {
    mapId: string;
    userId: string;
    expectedVersion: number;
    sourceHash: string;
    sourceFingerprint: string;
  }): number | null {
    const now = Date.now();
    const result = this.sql
      .prepare(`UPDATE maps SET source_blob_hash=?, source_fingerprint=?,
      source_version=source_version+1, updated_at=? WHERE id=? AND source_version=? AND EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id=maps.project_id AND pm.user_id=? AND pm.role IN ('owner','editor')
      )`)
      .run(
        input.sourceHash,
        input.sourceFingerprint,
        now,
        input.mapId,
        input.expectedVersion,
        input.userId,
      );
    if (result.changes !== 1) return null;
    this.sql
      .prepare('UPDATE projects SET updated_at=? WHERE id=(SELECT project_id FROM maps WHERE id=?)')
      .run(now, input.mapId);
    return input.expectedVersion + 1;
  }

  public createCheckpoint(input: {
    mapId: string;
    userId: string;
    name: string;
  }): Record<string, unknown> | null {
    const map = this.map(input.mapId, input.userId);
    if (!map || map.role === 'viewer') return null;
    const id = randomUUID();
    const createdAt = Date.now();
    this.sql
      .prepare('INSERT INTO map_checkpoints VALUES(?,?,?,?,?,?,?)')
      .run(id, map.id, input.name, map.sourceVersion, map.sourceHash, input.userId, createdAt);
    return { id, name: input.name, sourceVersion: map.sourceVersion, createdAt };
  }

  public listResourceMounts(
    projectId: string,
    userId: string,
  ): readonly Record<string, unknown>[] | null {
    if (!this.role(projectId, userId)) return null;
    return this.sql
      .prepare(`SELECT id,ordinal,provider,provider_asset_id,expected_sha256,kind,display_name,metadata_json,created_at
      FROM resource_mounts WHERE project_id=? ORDER BY ordinal`)
      .all(projectId) as Record<string, unknown>[];
  }

  public listResourceMountsForProject(projectId: string): readonly Record<string, unknown>[] {
    return this.sql
      .prepare(`SELECT id,ordinal,provider,provider_asset_id,expected_sha256,kind,display_name,metadata_json,created_at
      FROM resource_mounts WHERE project_id=? ORDER BY ordinal`)
      .all(projectId) as Record<string, unknown>[];
  }

  public createResourceMount(input: {
    projectId: string;
    userId: string;
    providerAssetId: string;
    expectedSha256: string;
    kind: string;
    displayName: string;
    metadata: unknown;
  }): Record<string, unknown> | null {
    const role = this.role(input.projectId, input.userId);
    if (role !== 'owner') return null;
    const id = randomUUID();
    const ordinal = (
      this.sql
        .prepare(
          'SELECT COALESCE(MAX(ordinal),-1)+1 AS value FROM resource_mounts WHERE project_id=?',
        )
        .get(input.projectId) as { value: number }
    ).value;
    const createdAt = Date.now();
    this.sql
      .prepare('INSERT INTO resource_mounts VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        input.projectId,
        ordinal,
        'artbin',
        input.providerAssetId,
        input.expectedSha256,
        input.kind,
        input.displayName,
        JSON.stringify(input.metadata),
        input.userId,
        createdAt,
      );
    return {
      id,
      ordinal,
      provider: 'artbin',
      providerAssetId: input.providerAssetId,
      expectedSha256: input.expectedSha256,
      kind: input.kind,
      displayName: input.displayName,
      createdAt,
    };
  }

  public resourceMount(
    projectId: string,
    mountId: string,
    userId: string,
  ): {
    expectedSha256: string;
    kind: string;
    displayName: string;
    metadata: Record<string, unknown>;
  } | null {
    if (!this.role(projectId, userId)) return null;
    const row = this.sql
      .prepare(
        'SELECT expected_sha256,kind,display_name,metadata_json FROM resource_mounts WHERE project_id=? AND id=?',
      )
      .get(projectId, mountId) as
      | {
          expected_sha256: string;
          kind: string;
          display_name: string;
          metadata_json: string;
        }
      | undefined;
    return row
      ? {
          expectedSha256: row.expected_sha256,
          kind: row.kind,
          displayName: row.display_name,
          metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
        }
      : null;
  }

  public resourceMountForProject(
    projectId: string,
    mountId: string,
  ): {
    expectedSha256: string;
    kind: string;
    displayName: string;
    metadata: Record<string, unknown>;
  } | null {
    const row = this.sql
      .prepare(
        'SELECT expected_sha256,kind,display_name,metadata_json FROM resource_mounts WHERE project_id=? AND id=?',
      )
      .get(projectId, mountId) as
      | {
          expected_sha256: string;
          kind: string;
          display_name: string;
          metadata_json: string;
        }
      | undefined;
    return row
      ? {
          expectedSha256: row.expected_sha256,
          kind: row.kind,
          displayName: row.display_name,
          metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
        }
      : null;
  }

  public createBuild(input: {
    mapId: string;
    userId: string;
    sourceVersion: number;
    profileId: string;
    quality: 'preview' | 'final';
  }): { id: string; createdAt: number } {
    const id = randomUUID();
    const createdAt = Date.now();
    this.sql
      .prepare(`INSERT INTO builds(id,map_id,requested_by,room_version,profile_id,quality,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'queued',?,?)`)
      .run(
        id,
        input.mapId,
        input.userId,
        input.sourceVersion,
        input.profileId,
        input.quality,
        createdAt,
        createdAt,
      );
    return { id, createdAt };
  }

  public updateBuild(
    id: string,
    status: 'running' | 'succeeded' | 'failed',
    result: unknown = null,
    sourceSha256: string | null = null,
  ): void {
    this.sql
      .prepare('UPDATE builds SET status=?,result_json=?,source_sha256=?,updated_at=? WHERE id=?')
      .run(status, result === null ? null : JSON.stringify(result), sourceSha256, Date.now(), id);
  }

  public listBuilds(mapId: string, userId: string): readonly Record<string, unknown>[] | null {
    const map = this.map(mapId, userId);
    if (!map) return null;
    const rows = this.sql
      .prepare(`SELECT id,room_version AS source_version,profile_id,quality,status,source_sha256,result_json,created_at,updated_at
      FROM builds WHERE map_id=? ORDER BY created_at DESC LIMIT 20`)
      .all(mapId) as Record<string, unknown>[];
    // oxlint-disable-next-line no-map-spread -- database rows are immutable response values.
    return rows.map((row) => ({
      ...row,
      result: typeof row.result_json === 'string' ? JSON.parse(row.result_json) : null,
      result_json: undefined,
    }));
  }

  public createShare(input: {
    projectId: string;
    mapId?: string;
    role: ShareRole;
    userId: string;
    expiresAt?: number;
  }): { id: string; token: string } {
    const id = randomUUID();
    const value = token();
    this.sql
      .prepare('INSERT INTO share_links VALUES(?,?,?,?,?,?,?,NULL,?)')
      .run(
        id,
        digest(value),
        input.projectId,
        input.mapId ?? null,
        input.role,
        input.userId,
        input.expiresAt ?? null,
        Date.now(),
      );
    return { id, token: value };
  }

  public exchangeShare(
    value: string,
    displayName: string,
  ): { token: string; expiresAt: number } | null {
    const share = this.sql
      .prepare(
        `SELECT id,expires_at FROM share_links WHERE token_hash=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)`,
      )
      .get(digest(value), Date.now()) as { id: string; expires_at: number | null } | undefined;
    if (!share) return null;
    const guestToken = token();
    const expiresAt = Math.min(
      share.expires_at ?? Number.MAX_SAFE_INTEGER,
      Date.now() + 7 * 24 * 60 * 60_000,
    );
    this.sql
      .prepare('INSERT INTO guest_sessions VALUES(?,?,?,?,?)')
      .run(digest(guestToken), share.id, randomUUID(), displayName, expiresAt);
    return { token: guestToken, expiresAt };
  }

  public guestAccess(value: string | undefined, mapId: string): GuestAccess | null {
    if (!value) return null;
    const row = this.sql
      .prepare(`SELECT gs.actor_id,gs.display_name,sl.role,sl.id AS share_id
      FROM guest_sessions gs JOIN share_links sl ON sl.id=gs.share_id JOIN maps m ON m.project_id=sl.project_id
      WHERE gs.token_hash=? AND gs.expires_at>? AND sl.revoked_at IS NULL
      AND (sl.expires_at IS NULL OR sl.expires_at>?) AND m.id=? AND (sl.map_id IS NULL OR sl.map_id=m.id)`)
      .get(digest(value), Date.now(), Date.now(), mapId) as
      | { actor_id: string; display_name: string; role: ShareRole; share_id: string }
      | undefined;
    return row
      ? {
          actorId: row.actor_id,
          displayName: row.display_name,
          role: row.role,
          shareId: row.share_id,
        }
      : null;
  }

  public mapForGuest(
    mapId: string,
    access: GuestAccess,
  ): {
    readonly id: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly game: 'quake' | 'goldsrc';
    readonly name: string;
    readonly format: 'valve-220' | 'quake';
    readonly roomId: string;
    readonly roomVersion: number;
    readonly sourceVersion: number;
    readonly sourceHash: string;
    readonly role: ShareRole;
  } | null {
    const row = this.sql
      .prepare(`SELECT m.id,m.project_id,m.name,m.format,m.room_id,m.room_version,m.source_version,m.source_blob_hash,p.name AS project_name,p.game
      FROM maps m JOIN projects p ON p.id=m.project_id JOIN share_links sl ON sl.project_id=p.id
      WHERE m.id=? AND sl.id=? AND p.archived_at IS NULL AND (sl.map_id IS NULL OR sl.map_id=m.id)`)
      .get(mapId, access.shareId) as
      | {
          id: string;
          project_id: string;
          name: string;
          format: 'valve-220' | 'quake';
          room_id: string;
          room_version: number;
          source_version: number;
          source_blob_hash: string;
          project_name: string;
          game: 'quake' | 'goldsrc';
        }
      | undefined;
    return row
      ? {
          id: row.id,
          projectId: row.project_id,
          projectName: row.project_name,
          game: row.game,
          name: row.name,
          format: row.format,
          roomId: row.room_id,
          roomVersion: row.room_version,
          sourceVersion: row.source_version,
          sourceHash: row.source_blob_hash,
          role: access.role,
        }
      : null;
  }

  public saveGuestMapSource(input: {
    mapId: string;
    access: GuestAccess;
    expectedVersion: number;
    sourceHash: string;
    sourceFingerprint: string;
  }): number | null {
    if (input.access.role !== 'editor' || !this.mapForGuest(input.mapId, input.access)) return null;
    const result = this.sql
      .prepare(
        'UPDATE maps SET source_blob_hash=?,source_fingerprint=?,source_version=source_version+1,updated_at=? WHERE id=? AND source_version=?',
      )
      .run(
        input.sourceHash,
        input.sourceFingerprint,
        Date.now(),
        input.mapId,
        input.expectedVersion,
      );
    return result.changes === 1 ? input.expectedVersion + 1 : null;
  }
}
