import { EditorMaterialCatalog, type EditorMaterial } from '@jackharrhy/worldview-editor/core';
import { readPcxPalette, readWalTextureHeader } from '@jackharrhy/worldview/core';

import { decodeProjectMaterialImage, projectMaterialName } from './project-material-assets.js';
import {
  loadProjectEntityDefinitions,
  loadProjectGameAssets,
  loadProjectSprites,
  projectFile,
  type ProjectEntityDefinitions,
  type ProjectSprites,
  type WorldviewProjectWorkspace,
} from './project-workspace.js';

const MAX_CONCURRENT_IMAGE_DECODES = 8;
const MAX_CONCURRENT_GAME_ASSET_READS = 8;
const REPLACEMENT_PRIORITY = new Map([
  ['jpeg', 0],
  ['jpg', 1],
  ['tga', 2],
  ['png', 3],
]);

interface LoadedGameAsset {
  readonly sourcePath: string;
  readonly data: ArrayBuffer;
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = [];
  results.length = values.length;
  let nextIndex = 0;
  const run = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      const value = values[index];
      if (value === undefined) return;
      results[index] = await worker(value, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => run()),
  );
  return results;
}

export interface LoadedProjectResources {
  readonly catalog: EditorMaterialCatalog;
  readonly wadSources: ReadonlyMap<string, ArrayBuffer>;
  readonly gameAssets: ReadonlyMap<string, ArrayBuffer>;
  readonly palette?: Uint8Array;
  readonly definitions: ProjectEntityDefinitions;
  readonly sprites: ProjectSprites;
  readonly messages: readonly string[];
}

async function explicitPalette(
  workspace: WorldviewProjectWorkspace,
): Promise<Uint8Array | undefined> {
  const path = workspace.manifest.resources.palette;
  if (!path) return undefined;
  const bytes = new Uint8Array(await (await projectFile(workspace.handle, path)).arrayBuffer());
  if (path.toLowerCase().endsWith('.pcx')) return readPcxPalette(bytes);
  if (bytes.byteLength < 768) {
    throw new Error(`${path} is not a 768-byte Quake palette or PCX palette`);
  }
  return bytes.slice(0, 768);
}

async function readGameAssets(
  workspace: WorldviewProjectWorkspace,
  signal: AbortSignal,
): Promise<Map<string, LoadedGameAsset>> {
  const files = await loadProjectGameAssets(workspace);
  const data = await mapConcurrent(files, MAX_CONCURRENT_GAME_ASSET_READS, async ({ file }) => {
    signal.throwIfAborted();
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    return bytes;
  });
  const assets = new Map<string, LoadedGameAsset>();
  for (const [index, asset] of files.entries()) {
    const bytes = data[index];
    if (!bytes) throw new Error(`${asset.path} could not be read`);
    assets.set(asset.logicalPath, { sourcePath: asset.path, data: bytes });
  }
  return assets;
}

function selectedReplacements(
  assets: ReadonlyMap<string, LoadedGameAsset>,
): ReadonlyMap<string, LoadedGameAsset & { readonly logicalPath: string }> {
  const replacements = new Map<string, LoadedGameAsset & { readonly logicalPath: string }>();
  for (const [logicalPath, asset] of assets) {
    const name = projectMaterialName(logicalPath);
    const extension = logicalPath.split('.').pop();
    if (!name || !extension || extension === 'wal') continue;
    const existing = replacements.get(name);
    const existingExtension = existing?.logicalPath.split('.').pop() ?? '';
    if (
      !existing ||
      (REPLACEMENT_PRIORITY.get(extension) ?? -1) >
        (REPLACEMENT_PRIORITY.get(existingExtension) ?? -1)
    ) {
      replacements.set(name, { logicalPath, ...asset });
    }
  }
  return replacements;
}

async function decodeReplacementMaterials(
  assets: ReadonlyMap<string, LoadedGameAsset>,
  signal: AbortSignal,
): Promise<{
  readonly materials: readonly EditorMaterial[];
  readonly messages: readonly string[];
}> {
  const entries = [...selectedReplacements(assets)];
  const decoded = await mapConcurrent(
    entries,
    MAX_CONCURRENT_IMAGE_DECODES,
    async ([name, replacement]) => {
      try {
        signal.throwIfAborted();
        const image = await decodeProjectMaterialImage(replacement.logicalPath, replacement.data);
        signal.throwIfAborted();
        const companionWal = assets.get(`textures/${name}.wal`);
        let walHeader: ReturnType<typeof readWalTextureHeader> | null = null;
        let message: string | undefined;
        if (companionWal) {
          try {
            walHeader = readWalTextureHeader(companionWal.data);
          } catch (error) {
            message = `${companionWal.sourcePath}: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        const material: EditorMaterial = {
          name: walHeader?.name ?? name,
          sourceName: replacement.sourcePath,
          width: image.width,
          height: image.height,
          logicalWidth: walHeader?.width ?? image.width,
          logicalHeight: walHeader?.height ?? image.height,
          rgba: image.rgba,
          alphaTest: false,
        };
        return { material, message };
      } catch (error) {
        signal.throwIfAborted();
        return {
          material: undefined,
          message: `${replacement.sourcePath}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  );
  return {
    materials: decoded.flatMap(({ material }) => (material ? [material] : [])),
    messages: decoded.flatMap(({ message }) => (message ? [message] : [])),
  };
}

export async function loadWorkspaceResources(
  workspace: WorldviewProjectWorkspace,
  builtInMaterials: readonly EditorMaterial[],
  signal: AbortSignal,
): Promise<LoadedProjectResources> {
  const wadPaths = workspace.manifest.resources.wads;
  const [configuredPalette, wadData, gameAssets, definitions, sprites] = await Promise.all([
    explicitPalette(workspace),
    Promise.all(
      wadPaths.map(async (path) => (await projectFile(workspace.handle, path)).arrayBuffer()),
    ),
    readGameAssets(workspace, signal),
    loadProjectEntityDefinitions(workspace),
    loadProjectSprites(workspace),
  ]);
  signal.throwIfAborted();

  const gamePalette = gameAssets.get('pics/colormap.pcx');
  const palette = configuredPalette ?? (gamePalette ? readPcxPalette(gamePalette.data) : undefined);
  const catalog = new EditorMaterialCatalog();
  const wadSources = new Map<string, ArrayBuffer>();
  const messages: string[] = [];
  for (const material of builtInMaterials) catalog.set(material);

  for (const [index, path] of wadPaths.entries()) {
    const data = wadData[index];
    if (!data) throw new Error(`${path} could not be read`);
    const result = catalog.importWad(path, data, palette);
    wadSources.set(path, data);
    messages.push(`${path}: ${result.added} added, ${result.replaced} replaced`);
    const error = result.diagnostics.find(({ severity }) => severity === 'error');
    if (error) throw new Error(error.message);
  }

  const walAssets = [...gameAssets].filter(([path]) => path.endsWith('.wal'));
  if (walAssets.length > 0 && !palette) {
    throw new Error('Quake II WAL assets require pics/colormap.pcx or a palette resource');
  }
  if (palette) {
    for (const [, asset] of walAssets) {
      const result = catalog.importWal(asset.sourcePath, asset.data, palette);
      messages.push(`${asset.sourcePath}: ${result.added} added, ${result.replaced} replaced`);
      messages.push(...result.diagnostics.map(({ message }) => `${asset.sourcePath}: ${message}`));
    }
  }

  const replacements = await decodeReplacementMaterials(gameAssets, signal);
  for (const material of replacements.materials) catalog.set(material);
  messages.push(...replacements.messages);
  signal.throwIfAborted();

  return {
    catalog,
    wadSources,
    gameAssets: new Map([...gameAssets].map(([path, asset]) => [path, asset.data])),
    ...(palette ? { palette } : {}),
    definitions,
    sprites,
    messages,
  };
}
