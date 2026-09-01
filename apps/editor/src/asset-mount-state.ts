import {
  orderAssetMounts,
  type AssetMountDescriptor,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';
import { z } from 'zod';
import { EDITOR_STORES, openEditorDatabase } from './editor-database.js';

export type StoredAssetMount = AssetMountDescriptor & {
  readonly scopeId: string;
  readonly data?: ArrayBuffer | undefined;
};

const StoredAssetMountBaseSchema = {
  id: z.string().min(1).max(4_096),
  scopeId: z.string().min(1).max(4_096),
  label: z.string().min(1).max(4_096),
  priority: z.number().int(),
  profile: z.enum(['quake', 'goldsrc', 'quake2']),
  data: z.instanceof(ArrayBuffer).optional(),
};

export const StoredAssetMountSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...StoredAssetMountBaseSchema, kind: z.literal('builtin') }),
  z.strictObject({
    ...StoredAssetMountBaseSchema,
    kind: z.literal('project-wad'),
    sourceName: z.string().min(1).max(4_096),
    contentFingerprint: z.string().min(1).max(256).optional(),
  }),
  z.strictObject({
    ...StoredAssetMountBaseSchema,
    kind: z.literal('browser-wad'),
    sourceName: z.string().min(1).max(4_096),
    contentFingerprint: z.string().min(1).max(256),
  }),
]) satisfies z.ZodType<StoredAssetMount>;

export interface AssetMountStorage {
  list(scopeId: string): Promise<readonly StoredAssetMount[]>;
  put(mount: StoredAssetMount): Promise<void>;
}

export class IndexedDbAssetMountStorage implements AssetMountStorage {
  public async list(scopeId: string): Promise<readonly StoredAssetMount[]> {
    const values: unknown[] = await (
      await openEditorDatabase()
    ).getAllFromIndex(EDITOR_STORES.assetMounts, 'scopeId', scopeId);
    return values.flatMap((value) => {
      const mount = StoredAssetMountSchema.safeParse(value);
      return mount.success ? [mount.data] : [];
    });
  }

  public async put(mount: StoredAssetMount): Promise<void> {
    await (await openEditorDatabase()).put(EDITOR_STORES.assetMounts, mount);
  }
}

export class AssetMountStateService {
  public constructor(
    private readonly storage: AssetMountStorage = new IndexedDbAssetMountStorage(),
  ) {}

  public async list(scopeId: string): Promise<readonly StoredAssetMount[]> {
    return orderAssetMounts(await this.storage.list(scopeId)) as readonly StoredAssetMount[];
  }

  public async addBrowserWad(
    scopeId: string,
    profile: WorldviewGameProfile,
    name: string,
    data: ArrayBuffer,
    priority: number,
  ): Promise<StoredAssetMount> {
    const digest = await crypto.subtle.digest('SHA-256', data);
    const fingerprint = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    const mount: StoredAssetMount = {
      id: `${scopeId}:wad:${fingerprint}`,
      scopeId,
      kind: 'browser-wad',
      label: name,
      sourceName: name,
      priority,
      profile,
      contentFingerprint: fingerprint,
      data,
    };
    await this.storage.put(mount);
    return mount;
  }
}
