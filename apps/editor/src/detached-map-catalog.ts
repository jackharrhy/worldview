import { z } from 'zod';

import { EDITOR_STORES, openEditorDatabase } from './editor-database.js';

export interface DetachedMapSummary {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
  readonly updatedAt: number;
}

const DetachedMapSummaryRecordSchema = z.object({
  id: z.string().min(1).max(256),
  fileName: z.string().min(1).max(4_096),
  reason: z.string().min(1).max(4_096),
  createdAt: z.number().int().nonnegative(),
});

/** Lightweight home-route projection; full map validation stays behind local-map intent. */
export async function listDetachedMapSummaries(): Promise<readonly DetachedMapSummary[]> {
  const values: unknown[] = await (await openEditorDatabase()).getAll(EDITOR_STORES.detachedMaps);
  return values
    .flatMap((value) => {
      const parsed = DetachedMapSummaryRecordSchema.safeParse(value);
      return parsed.success
        ? [
            {
              id: parsed.data.id,
              name: parsed.data.fileName,
              reason: parsed.data.reason,
              updatedAt: parsed.data.createdAt,
            },
          ]
        : [];
    })
    .toSorted((left, right) => right.updatedAt - left.updatedAt);
}
