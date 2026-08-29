import {
  EntityDefinitionCatalog,
  parseEntityDefinitionFile,
  parseWorldviewProject,
  type EntityDefinitionDiagnostic,
  type ParsedEntityDefinitionFile,
  type WorldviewProjectManifest,
} from '@jackharrhy/worldview-editor/core';
import { parseGoldSrcSprite } from '@jackharrhy/worldview/core';
import type { EditorSpriteMaterial } from '@jackharrhy/worldview-editor';
import type { EditorFileHandle } from './project-files.js';

export const WORLDVIEW_PROJECT_FILE = 'worldview.project.json';

export interface EditorDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  getFileHandle(name: string): Promise<{ getFile(): Promise<File> }>;
  getDirectoryHandle(name: string): Promise<EditorDirectoryHandle>;
  entries(): AsyncIterableIterator<
    [string, EditorDirectoryHandle | (EditorFileHandle & { readonly kind: 'file' })]
  >;
  queryPermission?(options: { readonly mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { readonly mode: 'readwrite' }): Promise<PermissionState>;
  isSameEntry?(other: EditorDirectoryHandle): Promise<boolean>;
}

export async function ensureProjectDirectoryPermission(
  handle: EditorDirectoryHandle,
  requestPermission: boolean,
): Promise<boolean> {
  const current = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (current === 'granted') return true;
  if (current === 'denied' || !requestPermission || !handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: { readonly mode: 'readwrite' }) => Promise<EditorDirectoryHandle>;
}

export interface ProjectMapFile {
  readonly path: string;
  readonly handle: EditorFileHandle;
}

export interface ProjectEntityDefinitions {
  readonly catalog: EntityDefinitionCatalog;
  readonly diagnostics: readonly EntityDefinitionDiagnostic[];
}

export interface ProjectSprites {
  readonly sprites: readonly EditorSpriteMaterial[];
  readonly diagnostics: readonly string[];
}

export interface WorldviewProjectWorkspace {
  readonly handle: EditorDirectoryHandle;
  readonly manifest: WorldviewProjectManifest;
  readonly maps: readonly ProjectMapFile[];
}

export async function pickProjectDirectory(): Promise<EditorDirectoryHandle | null> {
  const picker = (globalThis.window as DirectoryPickerWindow | undefined)?.showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: 'readwrite' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

async function directoryAt(
  root: EditorDirectoryHandle,
  parts: readonly string[],
): Promise<EditorDirectoryHandle> {
  let current = root;
  for (const part of parts) {
    if (!part || part === '.') continue;
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

export async function projectFile(root: EditorDirectoryHandle, path: string): Promise<File> {
  const parts = path.split('/');
  const name = parts.pop();
  if (!name) throw new Error(`Project path ${path} has no file name`);
  const directory = await directoryAt(root, parts);
  return (await directory.getFileHandle(name)).getFile();
}

async function mapsInDirectory(
  directory: EditorDirectoryHandle,
  prefix: string,
): Promise<readonly ProjectMapFile[]> {
  const maps: ProjectMapFile[] = [];
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') maps.push(...(await mapsInDirectory(handle, path)));
    else if (name.toLowerCase().endsWith('.map')) {
      maps.push({ path, handle });
    }
  }
  return maps;
}

async function spriteFilesInDirectory(
  directory: EditorDirectoryHandle,
  prefix: string,
): Promise<readonly { readonly path: string; readonly file: File }[]> {
  const files: { path: string; file: File }[] = [];
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') files.push(...(await spriteFilesInDirectory(handle, path)));
    else if (name.toLowerCase().endsWith('.spr'))
      files.push({ path, file: await handle.getFile() });
  }
  return files;
}

export async function openWorldviewProject(
  handle: EditorDirectoryHandle,
): Promise<WorldviewProjectWorkspace> {
  const manifestFile = await projectFile(handle, WORLDVIEW_PROJECT_FILE);
  const manifest = parseWorldviewProject(await manifestFile.text());
  const maps = (
    await Promise.all(
      manifest.mapRoots.map(async (root) => {
        const directory = await directoryAt(handle, root === '.' ? [] : root.split('/'));
        return mapsInDirectory(directory, root === '.' ? '' : root);
      }),
    )
  )
    .flat()
    .toSorted((left, right) => left.path.localeCompare(right.path));
  const uniqueMaps = new Map(maps.map((map) => [map.path.toLowerCase(), map]));
  return { handle, manifest, maps: [...uniqueMaps.values()] };
}

export async function loadProjectEntityDefinitions(
  workspace: WorldviewProjectWorkspace,
): Promise<ProjectEntityDefinitions> {
  const parsed: ParsedEntityDefinitionFile[] = [];
  const diagnostics: EntityDefinitionDiagnostic[] = [];
  const loaded = new Set<string>();
  const load = async (path: string, format: 'fgd' | 'def' | 'ent'): Promise<void> => {
    const normalized = path.toLowerCase();
    if (loaded.has(normalized)) return;
    loaded.add(normalized);
    try {
      const file = await projectFile(workspace.handle, path);
      const result = parseEntityDefinitionFile(format, await file.text(), path);
      parsed.push(result);
      diagnostics.push(...result.diagnostics);
      if (format === 'fgd') {
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
        for (const include of result.includes) {
          const includedPath = `${parent}${include}`;
          if (includedPath.split('/').includes('..')) {
            diagnostics.push({
              severity: 'error',
              message: `FGD include escapes the project root: ${include}`,
              sourcePath: path,
            });
          } else await load(includedPath, 'fgd');
        }
      }
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        sourcePath: path,
      });
    }
  };
  for (const { path, format } of workspace.manifest.resources.entityDefinitions) {
    await load(path, format);
  }
  return { catalog: new EntityDefinitionCatalog(parsed), diagnostics };
}

export async function loadProjectSprites(
  workspace: WorldviewProjectWorkspace,
): Promise<ProjectSprites> {
  const roots = await Promise.all(
    workspace.manifest.resources.spriteRoots.map(async (root): Promise<ProjectSprites> => {
      const rootSprites: EditorSpriteMaterial[] = [];
      const rootDiagnostics: string[] = [];
      try {
        const prefix = root === '.' ? '' : root;
        const directory = await directoryAt(workspace.handle, prefix ? prefix.split('/') : []);
        const files = await spriteFilesInDirectory(directory, prefix);
        const parsed = await Promise.all(
          files.map(async ({ path, file }) => {
            try {
              const sprite = parseGoldSrcSprite(await file.arrayBuffer());
              const frame = sprite.frames[0]?.frames[0];
              if (!frame) throw new Error('sprite has no displayable frame');
              return {
                sprite: {
                  path,
                  material: {
                    name: `__worldview_sprite__${path.toLowerCase()}`,
                    sourceName: path,
                    width: frame.width,
                    height: frame.height,
                    rgba: frame.rgba,
                    alphaTest: true,
                  },
                } satisfies EditorSpriteMaterial,
              };
            } catch (error) {
              return {
                diagnostic: `${path}: ${error instanceof Error ? error.message : String(error)}`,
              };
            }
          }),
        );
        for (const result of parsed) {
          if ('sprite' in result) rootSprites.push(result.sprite);
          else rootDiagnostics.push(result.diagnostic);
        }
      } catch (error) {
        rootDiagnostics.push(`${root}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { sprites: rootSprites, diagnostics: rootDiagnostics };
    }),
  );
  const sprites: EditorSpriteMaterial[] = [];
  const diagnostics: string[] = [];
  for (const root of roots) {
    sprites.push(...root.sprites);
    diagnostics.push(...root.diagnostics);
  }
  return { sprites, diagnostics };
}
