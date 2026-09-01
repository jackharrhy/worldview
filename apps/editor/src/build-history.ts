import { MapCompileResultSchema, type MapCompileResult } from '@jackharrhy/worldview-editor/core';
import { z } from 'zod';
import { EDITOR_STORES, openEditorDatabase } from './editor-database.js';

export const BUILD_HISTORY_LIMIT = 20;

export interface MapBuildHistoryRecord {
  readonly version: 1;
  readonly buildId: string;
  readonly mapKey: string;
  readonly createdAt: number;
  readonly result: MapCompileResult;
}

export const MapBuildHistoryRecordSchema = z.strictObject({
  version: z.literal(1),
  buildId: z.string().min(1).max(256),
  mapKey: z.string().min(1).max(4_096),
  createdAt: z.number().int().nonnegative(),
  result: MapCompileResultSchema,
}) satisfies z.ZodType<MapBuildHistoryRecord>;

export interface MapBuildHistoryStorage {
  save(record: MapBuildHistoryRecord): Promise<void>;
  list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]>;
  remove(buildId: string): Promise<void>;
}

export class IndexedDbMapBuildHistoryStorage implements MapBuildHistoryStorage {
  public async save(record: MapBuildHistoryRecord): Promise<void> {
    await (await openEditorDatabase()).put(EDITOR_STORES.buildHistory, record);
  }

  public async list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]> {
    const values: unknown[] = await (
      await openEditorDatabase()
    ).getAllFromIndex(EDITOR_STORES.buildHistory, 'mapKey', mapKey);
    return values
      .flatMap((value) => {
        const record = MapBuildHistoryRecordSchema.safeParse(value);
        return record.success ? [record.data] : [];
      })
      .toSorted((left, right) => right.createdAt - left.createdAt);
  }

  public async remove(buildId: string): Promise<void> {
    await (await openEditorDatabase()).delete(EDITOR_STORES.buildHistory, buildId);
  }
}

function quotaFailure(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}

export class MapBuildHistoryService {
  private lastTimestamp = 0;

  public constructor(
    private readonly storage: MapBuildHistoryStorage = new IndexedDbMapBuildHistoryStorage(),
    private readonly onError: (error: unknown) => void = console.error,
    private readonly retentionLimit = BUILD_HISTORY_LIMIT,
  ) {}

  public async record(mapKey: string, result: MapCompileResult): Promise<void> {
    const createdAt = Math.max(Date.now(), this.lastTimestamp + 1);
    this.lastTimestamp = createdAt;
    const record: MapBuildHistoryRecord = {
      version: 1,
      buildId: result.buildId,
      mapKey,
      createdAt,
      result: structuredClone(result),
    };
    try {
      await this.storage.save(record);
    } catch (error) {
      if (!quotaFailure(error)) {
        this.onError(error);
        return;
      }
      const existing = await this.storage.list(mapKey);
      await Promise.all(
        existing
          .slice(Math.max(0, Math.floor(this.retentionLimit / 2)))
          .map((expired) => this.storage.remove(expired.buildId)),
      );
      try {
        await this.storage.save(record);
      } catch (retryError) {
        this.onError(retryError);
        return;
      }
    }
    const records = await this.storage.list(mapKey);
    await Promise.all(
      records.slice(this.retentionLimit).map((expired) => this.storage.remove(expired.buildId)),
    );
  }

  public list(mapKey: string): Promise<readonly MapBuildHistoryRecord[]> {
    return this.storage.list(mapKey);
  }
}
