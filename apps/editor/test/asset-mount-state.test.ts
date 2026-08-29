import { describe, expect, it } from 'vitest';
import {
  AssetMountStateService,
  type AssetMountStorage,
  type StoredAssetMount,
} from '../src/asset-mount-state.js';

class MemoryAssetMountStorage implements AssetMountStorage {
  public readonly mounts = new Map<string, StoredAssetMount>();
  public list(scopeId: string): Promise<readonly StoredAssetMount[]> {
    return Promise.resolve([...this.mounts.values()].filter((mount) => mount.scopeId === scopeId));
  }
  public put(mount: StoredAssetMount): Promise<void> {
    this.mounts.set(mount.id, mount);
    return Promise.resolve();
  }
}

describe('browser asset mounts', () => {
  it('persists WAD bytes with a content identity and deterministic priority', async () => {
    const storage = new MemoryAssetMountStorage();
    const service = new AssetMountStateService(storage);
    await service.addBrowserWad('map-a', 'quake', 'later.wad', new Uint8Array([2]).buffer, 20);
    await service.addBrowserWad('map-a', 'quake', 'earlier.wad', new Uint8Array([1]).buffer, 10);
    const mounts = await service.list('map-a');
    expect(mounts.map(({ label }) => label)).toEqual(['earlier.wad', 'later.wad']);
    expect(mounts[0]?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(new Uint8Array(mounts[0]!.data!)).toEqual(new Uint8Array([1]));
  });
});
