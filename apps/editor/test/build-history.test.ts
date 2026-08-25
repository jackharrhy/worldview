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
});
