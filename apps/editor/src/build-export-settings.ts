import { z } from 'zod';
import { openEditorDatabase } from './editor-database.js';
import type { EditorFileHandle } from './project-files.js';
import type { BuildExportFile } from './build-export-plan.js';

export interface ExportDirectory {
  readonly kind: 'directory';
  readonly name: string;
  getFileHandle(name: string, options: { create: true }): Promise<EditorFileHandle>;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

export const BuildExportSettingsSchema = z.object({
  scopeId: z.string(),
  quality: z.enum(['preview', 'final']).default('preview'),
  includeSource: z.boolean().default(false),
  afterBuild: z.boolean().default(false),
  directory: z
    .custom<ExportDirectory>(
      (value) =>
        value != null &&
        typeof value === 'object' &&
        'kind' in value &&
        value.kind === 'directory' &&
        'getFileHandle' in value &&
        typeof value.getFileHandle === 'function' &&
        'name' in value &&
        typeof value.name === 'string' &&
        'queryPermission' in value &&
        typeof value.queryPermission === 'function',
    )
    .nullable()
    .default(null),
});
export type BuildExportSettings = z.infer<typeof BuildExportSettingsSchema>;

export async function loadBuildExportSettings(scopeId: string): Promise<BuildExportSettings> {
  const database = await openEditorDatabase();
  const parsed = BuildExportSettingsSchema.safeParse(await database.get('build-exports', scopeId));
  return parsed.success && parsed.data.scopeId === scopeId
    ? parsed.data
    : BuildExportSettingsSchema.parse({ scopeId });
}

export async function saveBuildExportSettings(settings: BuildExportSettings): Promise<void> {
  const database = await openEditorDatabase();
  await database.put('build-exports', settings);
}

export function directoryExportSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickExportDirectory(): Promise<ExportDirectory> {
  const picker = (
    window as Window & {
      showDirectoryPicker?(options: { mode: 'readwrite' }): Promise<ExportDirectory>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('This browser supports downloads only.');
  return picker({ mode: 'readwrite' });
}

export async function writeBuildExport(
  directory: ExportDirectory,
  file: BuildExportFile,
): Promise<void> {
  // Permission is requested on the user's menu gesture, never after the compiler returns.
  if ((await directory.queryPermission({ mode: 'readwrite' })) !== 'granted')
    throw new Error(
      'Export directory permission expired. Choose the directory again in Export settings.',
    );
  const handle = await directory.getFileHandle(file.name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([file.data], { type: file.mediaType }));
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}
