import { describe, expect, it } from 'vitest';
import type { MapCompileResult } from '@jackharrhy/worldview-editor/core';

import {
  MapBuildHistoryService,
  type MapBuildHistoryRecord,
  type MapBuildHistoryStorage,
} from '../src/build-history.js';

class MemoryStorage implements MapBuildHistoryStorage {
  public readonly records = new Map<string, MapBuildHistoryRecord>();

  public async save(record: MapBuildHistoryRecord): Promise<void> {
    this.records.set(record.buildId, record);
  }

  public async list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.mapKey === mapKey)
      .toSorted((left, right) => right.createdAt - left.createdAt);
  }

  public async remove(buildId: string): Promise<void> {
    this.records.delete(buildId);
  }
}

class QuotaStorage extends MemoryStorage {
  public failNextSave = true;

  public override async save(record: MapBuildHistoryRecord): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new DOMException('quota full', 'QuotaExceededError');
    }
    await super.save(record);
  }
}

function result(buildId: string): MapCompileResult {
  return {
    backend: 'remote',
    status: 'succeeded',
    buildId,
    sourceDocumentRevision: 1,
    diagnostics: [],
    artifacts: [],
    logs: [],
    elapsedMilliseconds: 1,
  };
}

describe('map build history', () => {
  it('retains the newest bounded records independently per map', async () => {
    const storage = new MemoryStorage();
    const service = new MapBuildHistoryService(storage, () => undefined, 2);

    await service.record('one.map', result('one'));
    await service.record('one.map', result('two'));
    await service.record('one.map', result('three'));
    await service.record('other.map', result('other'));

    expect((await service.list('one.map')).map(({ buildId }) => buildId)).toEqual(['three', 'two']);
    expect((await service.list('other.map')).map(({ buildId }) => buildId)).toEqual(['other']);
  });

  it('prunes old records and retries once under quota pressure', async () => {
    const storage = new QuotaStorage();
    for (let index = 0; index < 4; index += 1) {
      storage.records.set(`old-${index}`, {
        version: 1,
        buildId: `old-${index}`,
        mapKey: 'one.map',
        createdAt: index,
        result: result(`old-${index}`),
      });
    }
    const errors: unknown[] = [];
    const service = new MapBuildHistoryService(storage, (error) => errors.push(error), 4);

    await service.record('one.map', result('new'));

    expect(errors).toEqual([]);
    expect(storage.records.has('new')).toBe(true);
    expect(storage.records.size).toBe(3);
  });
});
