import { gzipSync } from 'node:zlib';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { moduleReferences } from './lib/source-analysis.mjs';
import { resolveRelativeSource } from './lib/source-graph.mjs';

const repositoryRoot = process.cwd();
const editorSourceRoot = path.join(repositoryRoot, 'apps/editor/src');
const manifestPath = path.join(repositoryRoot, 'apps/editor/dist/.vite/manifest.json');
const ROUTE_ARCHITECTURE_CONTRACT = 'docs/plan.md#react-and-routing';

const sourceRoots = {
  bootstrap: 'apps/editor/src/main.tsx',
  home: ['apps/editor/src/routes/home-loader.ts', 'apps/editor/src/routes/home-route.tsx'],
};

const forbiddenHomePackages = new Set([
  '@jackharrhy/worldview',
  '@jackharrhy/worldview-editor',
  '@tanstack/react-query',
  'typegpu',
]);
const forbiddenHomePaths = [
  /\/build-presenter\./,
  /\/collaboration-/,
  /\/compiler-/,
  /\/editor-application\./,
  /\/editor-route\./,
  /\/render(?:er)?-/,
  /\/render\//,
  /\/style\.css$/,
  /\/webmcp-/,
];

function fail(message) {
  console.error(
    `Editor route boundary failed: ${message} (contract: ${ROUTE_ARCHITECTURE_CONTRACT})`,
  );
  process.exitCode = 1;
}

function repositoryPath(filename) {
  return path.relative(repositoryRoot, filename).split(path.sep).join('/');
}

function staticCssImports(source) {
  return [...source.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g)].map(
    (match) => match[1],
  );
}

async function collectStaticSourceGraph(entryFiles) {
  const pending = entryFiles.map((entry) => path.join(repositoryRoot, entry));
  const files = new Set();
  const packages = new Set();
  while (pending.length > 0) {
    const filename = pending.pop();
    if (!filename || files.has(filename)) continue;
    files.add(filename);
    const source = await readFile(filename, 'utf8');
    const specifiers = filename.endsWith('.css')
      ? staticCssImports(source)
      : moduleReferences(filename, source)
          .filter(({ dynamic, runtime }) => runtime && !dynamic)
          .map(({ specifier }) => specifier);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      const resolved = await resolveRelativeSource(filename, specifier, files);
      if (resolved) pending.push(resolved);
    }
  }
  return { files, packages };
}

async function checkSourceBoundaries() {
  const bootstrap = await collectStaticSourceGraph([sourceRoots.bootstrap]);
  const home = await collectStaticSourceGraph(sourceRoots.home);
  const bootstrapPaths = [...bootstrap.files].map(repositoryPath);
  const homePaths = [...home.files].map(repositoryPath);

  for (const candidate of [...bootstrapPaths, ...homePaths]) {
    if (forbiddenHomePaths.some((pattern) => pattern.test(`/${candidate}`))) {
      fail(`public bootstrap/home statically reaches ${candidate}`);
    }
  }
  for (const dependency of home.packages) {
    if (
      [...forbiddenHomePackages].some(
        (forbidden) => dependency === forbidden || dependency.startsWith(`${forbidden}/`),
      )
    ) {
      fail(`public home statically imports ${dependency}`);
    }
  }

  const editorFiles = await collectSourceFiles(editorSourceRoot);
  for (const filename of editorFiles) {
    const source = await readFile(filename, 'utf8');
    if (/import\s+(?!type\b)[^;]+\s+from\s+['"]@jackharrhy\/worldview['"]/.test(source)) {
      fail(
        `${repositoryPath(filename)} statically imports the viewer root; use a focused subpath or preserve the compiled-preview dynamic boundary`,
      );
    }
  }

  const preloadSource = await readFile(
    path.join(editorSourceRoot, 'routes/preload-editor.ts'),
    'utf8',
  );
  if (!/import\(['"]\.\/editor-route\.js['"]\)/.test(preloadSource)) {
    fail('/new-map prewarming must retain a dynamic editor-route import');
  }

  if (!process.exitCode) {
    console.log(
      `Editor route source boundaries passed (${bootstrap.files.size} bootstrap and ${home.files.size} home modules).`,
    );
  }
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectSourceFiles(target);
      return entry.isFile() && /\.tsx?$/.test(target) ? [target] : [];
    }),
  );
  return nested.flat();
}

function collectManifestGraph(manifest, entryKeys) {
  const pending = [...entryKeys];
  const keys = new Set();
  while (pending.length > 0) {
    const key = pending.pop();
    if (!key || keys.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) {
      fail(`production manifest is missing ${key}`);
      continue;
    }
    keys.add(key);
    pending.push(...(chunk.imports ?? []));
  }
  return keys;
}

function graphAssets(manifest, keys) {
  const assets = new Set();
  for (const key of keys) {
    const chunk = manifest[key];
    if (!chunk) continue;
    assets.add(chunk.file);
    for (const css of chunk.css ?? []) assets.add(css);
  }
  return assets;
}

async function measureAssets(assets) {
  let raw = 0;
  let gzip = 0;
  for (const asset of assets) {
    const contents = await readFile(path.join(repositoryRoot, 'apps/editor/dist', asset));
    raw += contents.byteLength;
    gzip += gzipSync(contents).byteLength;
  }
  return { raw, gzip };
}

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

async function checkBuildBoundaries() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    fail(
      `read ${repositoryPath(manifestPath)} after running the editor production build: ${error}`,
    );
    return;
  }

  const bootstrapKey = 'index.html';
  const homeKeys = ['src/routes/home-loader.ts', 'src/routes/home-route.tsx'];
  const newMapKey = 'src/routes/new-map-route.tsx';
  const editorKey = 'src/routes/editor-route.tsx';
  const viewerKey = '../../packages/worldview/dist/index.js';
  const bootstrapGraph = collectManifestGraph(manifest, [bootstrapKey]);
  const homeGraph = collectManifestGraph(manifest, [bootstrapKey, ...homeKeys]);
  const newMapGraph = collectManifestGraph(manifest, [bootstrapKey, newMapKey]);
  const editorGraph = collectManifestGraph(manifest, [bootstrapKey, editorKey]);
  const viewerGraph = collectManifestGraph(manifest, [viewerKey]);
  const incrementalViewerGraph = new Set([...viewerGraph].filter((key) => !editorGraph.has(key)));

  for (const forbidden of [editorKey, viewerKey]) {
    if (homeGraph.has(forbidden)) fail(`public home production graph reaches ${forbidden}`);
  }
  if (graphAssets(manifest, homeGraph).has(manifest[editorKey]?.css?.[0])) {
    fail('public home production graph reaches editor-only CSS');
  }
  if (newMapGraph.has(editorKey) || newMapGraph.has(viewerKey)) {
    fail('/new-map statically loads the editor or compiled viewer');
  }
  if (!(manifest[newMapKey]?.dynamicImports ?? []).includes(editorKey)) {
    fail('/new-map no longer prewarms the editor through a dynamic entry');
  }
  if (editorGraph.has(viewerKey)) {
    fail('the editor statically loads the compiled BSP viewer');
  }
  if (!(manifest[editorKey]?.dynamicImports ?? []).includes(viewerKey)) {
    fail('the compiled BSP viewer is not an editor-owned dynamic entry');
  }

  const graphs = [
    ['bootstrap', bootstrapGraph],
    ['home', homeGraph],
    ['new-map (before prewarm)', newMapGraph],
    ['editor (before compiled preview)', editorGraph],
    ['compiled preview (incremental)', incrementalViewerGraph],
  ];
  console.log('Editor production route graph:');
  for (const [label, graph] of graphs) {
    const assets = graphAssets(manifest, graph);
    const measurement = await measureAssets(assets);
    console.log(
      `- ${label}: ${graph.size} chunks, ${assets.size} JS/CSS files, ${kibibytes(measurement.raw)} raw, ${kibibytes(measurement.gzip)} gzip`,
    );
  }
  if (!process.exitCode) console.log('Editor production route boundaries passed.');
}

const mode = process.argv[2] ?? '--source';
if (mode === '--source') await checkSourceBoundaries();
else if (mode === '--build') await checkBuildBoundaries();
else {
  console.error(`Unknown mode ${mode}; expected --source or --build.`);
  process.exitCode = 1;
}
