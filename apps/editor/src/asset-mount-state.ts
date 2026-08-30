import {
  orderAssetMounts,
  type AssetMountDescriptor,
  type WorldviewGameProfile,
} from '@jackharrhy/worldview-editor/core';
import { z } from 'zod';

const DATABASE_NAME = 'worldview-editor-asset-mounts';
const DATABASE_VERSION = 1;
const STORE = 'mounts';

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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('scopeId', 'scopeId', { unique: false });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

export class IndexedDbAssetMountStorage implements AssetMountStorage {
  public async list(scopeId: string): Promise<readonly StoredAssetMount[]> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readonly');
      const values = await requestResult<unknown[]>(
        transaction.objectStore(STORE).index('scopeId').getAll(scopeId),
      );
      return values.flatMap((value) => {
        const mount = StoredAssetMountSchema.safeParse(value);
        return mount.success ? [mount.data] : [];
      });
    } finally {
      database.close();
    }
  }

  public async put(mount: StoredAssetMount): Promise<void> {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(mount);
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
      });
    } finally {
      database.close();
    }
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
