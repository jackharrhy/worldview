import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { analyzeRepositoryArchitecture } from './lib/repository-architecture.mjs';
import { interfacePropertyNames, moduleReferences } from './lib/source-analysis.mjs';
import { directedCycles, packageExportSpecifiers } from './lib/source-graph.mjs';

const LOCK_FIELDS = [
  'name',
  'version',
  'license',
  'workspaces',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'engines',
];

function lockEntry(manifest) {
  return Object.fromEntries(
    LOCK_FIELDS.filter((field) => manifest[field] !== undefined).map((field) => [
      field,
      manifest[field],
    ]),
  );
}

async function write(root, filename, contents) {
  const target = path.join(root, filename);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldview-architecture-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rootManifest = {
    name: 'architecture-fixture',
    private: true,
    workspaces: ['packages/*', 'apps/*'],
    packageManager: 'npm@11.0.0',
  };
  const manifests = {
    'packages/worldview': {
      name: '@jackharrhy/worldview',
      version: '0.0.0',
      exports: { '.': './dist/index.js', './core': './dist/core.js' },
      dependencies: options.worldviewDependencies ?? {},
    },
    'packages/worldview-editor': {
      name: '@jackharrhy/worldview-editor',
      version: '0.0.0',
      exports: { '.': './dist/index.js', './core': './dist/core.js' },
      dependencies: {
        '@jackharrhy/worldview': '*',
        ...(options.editorProtocolDependency ? { '@worldview/protocol': '*' } : {}),
      },
    },
    'packages/worldview-protocol': {
      name: options.protocolName ?? '@worldview/protocol',
      version: '0.0.0',
      exports: { '.': './dist/index.js' },
      dependencies: options.protocolEditorDevOnly ? {} : { '@jackharrhy/worldview-editor': '*' },
      ...(options.protocolEditorDevOnly
        ? { devDependencies: { '@jackharrhy/worldview-editor': '*' } }
        : {}),
    },
    'apps/viewer': {
      name: '@worldview/viewer',
      version: '0.0.0',
      dependencies: {
        '@jackharrhy/worldview': '*',
        ...(options.viewerEditorDependency ? { '@jackharrhy/worldview-editor': '*' } : {}),
      },
    },
    'apps/worldview-service': {
      name: '@worldview/service',
      version: '0.0.0',
      dependencies: {
        '@jackharrhy/worldview-editor': '*',
        '@worldview/protocol': '*',
      },
    },
  };
  await write(root, 'package.json', `${JSON.stringify(rootManifest)}\n`);
  for (const [directory, manifest] of Object.entries(manifests)) {
    await write(root, `${directory}/package.json`, `${JSON.stringify(manifest)}\n`);
  }
  const packages = { '': lockEntry(rootManifest) };
  for (const [directory, manifest] of Object.entries(manifests)) {
    packages[directory] = lockEntry(manifest);
  }
  await write(
    root,
    'package-lock.json',
    `${JSON.stringify({ name: rootManifest.name, lockfileVersion: 3, packages })}\n`,
  );
  await write(
    root,
    'packages/worldview/src/core/index.ts',
    options.worldviewCore ?? 'export const core = true;\n',
  );
  await write(
    root,
    'packages/worldview/src/render/renderer.ts',
    options.worldviewRenderer ?? "import { core } from '../core/index.js';\nexport { core };\n",
  );
  await write(
    root,
    'packages/worldview-editor/src/core/index.ts',
    "import { core } from '@jackharrhy/worldview/core';\nexport { core };\n",
  );
  await write(
    root,
    'packages/worldview-protocol/src/index.ts',
    "import type { core } from '@jackharrhy/worldview-editor/core';\nexport type Core = typeof core;\n",
  );
  await write(
    root,
    'apps/viewer/src/main.ts',
    options.viewerSource ?? "import { core } from '@jackharrhy/worldview';\nvoid core;\n",
  );
  await write(
    root,
    'apps/worldview-service/src/service-http.ts',
    options.serviceHttp ??
      'export interface ServiceRequestContext {\n  readonly request: unknown;\n  readonly response: unknown;\n  readonly url: URL;\n  readonly publicOrigin: string;\n  readonly secureCookies: boolean;\n}\n',
  );
  await write(
    root,
    'apps/worldview-service/src/server.ts',
    options.serviceServer ?? 'export const service = true;\n',
  );
  return { manifests, root };
}

async function violations(t, options) {
  const { root } = await fixture(t, options);
  return (await analyzeRepositoryArchitecture(root, { runCoreTypecheck: false })).violations;
}

function hasContract(found, contract) {
  assert.ok(
    found.some((violation) => violation.contract === contract),
    `expected ${contract}, received ${JSON.stringify(found)}`,
  );
}

test('accepts the intended package and layer direction', async (t) => {
  assert.deepEqual(await violations(t), []);
});

test('extracts runtime, type-only, side-effect, re-export, and dynamic module references', () => {
  const references = moduleReferences(
    'fixture.ts',
    `
    import 'side-effect';
    import type { Shape } from './types.js';
    import { type Other, value } from './mixed.js';
    export type { PublicShape } from './public-types.js';
    export { type PublicOther, publicValue } from './public.js';
    const lazy = import('./lazy.js');
    const computed = import(moduleName);
    const example = "import './not-code.js'";
    /* import './also-not-code.js'; */
  `,
  );
  assert.deepEqual(references, [
    { specifier: 'side-effect', runtime: true, dynamic: false },
    { specifier: './types.js', runtime: false, dynamic: false },
    { specifier: './mixed.js', runtime: true, dynamic: false },
    { specifier: './public-types.js', runtime: false, dynamic: false },
    { specifier: './public.js', runtime: true, dynamic: false },
    { specifier: './lazy.js', runtime: true, dynamic: true },
  ]);
});

test('distinguishes root export conditions from package subpaths', () => {
  assert.deepEqual(
    packageExportSpecifiers({
      name: '@worldview/example',
      exports: { types: './dist/index.d.ts', import: './dist/index.js' },
    }),
    new Set(['@worldview/example']),
  );
  assert.deepEqual(
    packageExportSpecifiers({
      name: '@worldview/example',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        './core': './dist/core.js',
      },
    }),
    new Set(['@worldview/example', '@worldview/example/core']),
  );
  assert.deepEqual(
    packageExportSpecifiers({ name: '@worldview/private-app', private: true }),
    new Set(),
  );
  assert.deepEqual(
    packageExportSpecifiers({ name: '@worldview/closed-package', exports: null }),
    new Set(),
  );
});

test('reads explicit interface properties without matching their referenced types', () => {
  assert.deepEqual(
    interfacePropertyNames(
      'fixture.ts',
      'export interface Context { readonly request: Request; readonly database: Database }',
      'Context',
    ),
    ['request', 'database'],
  );
  assert.equal(
    interfacePropertyNames('fixture.ts', 'interface Context { reset(): void }', 'Context'),
    null,
  );
});

test('detects only actual directed cycles', () => {
  assert.deepEqual(
    directedCycles(
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set()],
      ]),
    ),
    [],
  );
  assert.deepEqual(
    directedCycles(
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]),
    ),
    [['a', 'b', 'a']],
  );
});

test('rejects private package entrypoints and viewer-to-editor coupling', async (t) => {
  const found = await violations(t, {
    viewerEditorDependency: true,
    viewerSource:
      "import '@jackharrhy/worldview/src/private.js';\nimport '@jackharrhy/worldview-editor/core';\n",
  });
  hasContract(found, 'dependencies');
  hasContract(found, 'viewer');
});

test('rejects static runtime cycles while ignoring type-only edges', async (t) => {
  const { root } = await fixture(t);
  await write(
    root,
    'packages/worldview/src/core/index.ts',
    "export { first } from './first.js';\n",
  );
  await write(
    root,
    'packages/worldview/src/core/first.ts',
    "import { second } from './second.js';\nexport const first = second;\n",
  );
  await write(
    root,
    'packages/worldview/src/core/second.ts',
    "import { first } from './first.js';\nexport const second = first;\n",
  );
  let result = await analyzeRepositoryArchitecture(root, { runCoreTypecheck: false });
  hasContract(result.violations, 'dependencies');

  await write(
    root,
    'packages/worldview/src/core/second.ts',
    "import type { first } from './first.js';\nexport type Second = typeof first;\nexport const second = 1;\n",
  );
  result = await analyzeRepositoryArchitecture(root, { runCoreTypecheck: false });
  assert.ok(
    result.violations.every(
      (violation) =>
        violation.contract !== 'dependencies' ||
        !violation.message.includes('static runtime dependency cycle'),
    ),
  );
});

test('rejects cycles between workspaces', async (t) => {
  const found = await violations(t, { editorProtocolDependency: true });
  assert.ok(
    found.some(
      (violation) =>
        violation.contract === 'dependencies' &&
        violation.message.includes('workspace dependency cycle'),
    ),
  );
});

test('allows type-only workspace edges through development dependencies', async (t) => {
  assert.deepEqual(await violations(t, { protocolEditorDevOnly: true }), []);
});

test('rejects duplicate workspace names before building the dependency graph', async (t) => {
  const found = await violations(t, { protocolName: '@jackharrhy/worldview-editor' });
  assert.ok(
    found.some(
      (violation) =>
        violation.contract === 'workspace' &&
        violation.message.includes('duplicate workspace name'),
    ),
  );
});

test('rejects React in packages and core imports that escape into rendering', async (t) => {
  const found = await violations(t, {
    worldviewCore: "import React from 'react';\nimport '../render/renderer.js';\nvoid React;\n",
    worldviewDependencies: { react: '*' },
  });
  hasContract(found, 'dependencies');
  hasContract(found, 'core');
});

test('rejects raw GPU texture ownership inside renderer modules', async (t) => {
  const found = await violations(t, {
    worldviewRenderer: 'export function allocate(device) { return device.createTexture({}); }\n',
  });
  hasContract(found, 'gpu');
});

test('rejects raw-only WebGPU constructors regardless of receiver name', async (t) => {
  const found = await violations(t, {
    worldviewRenderer: 'export function shader(gpu) { return gpu.createShaderModule({}); }\n',
  });
  hasContract(found, 'gpu');
});

test('rejects domain services in the HTTP context and route declarations in the server', async (t) => {
  const found = await violations(t, {
    serviceHttp:
      'export interface ServiceRequestContext {\n  readonly request: unknown;\n  readonly response: unknown;\n  readonly url: URL;\n  readonly publicOrigin: string;\n  readonly secureCookies: boolean;\n  readonly repository: unknown;\n}\n',
    serviceServer: 'defineRoute("wrong-place", "GET", "/", () => undefined);\n',
  });
  for (const message of ['ServiceRequestContext must contain only', 'route declarations belong']) {
    assert.ok(
      found.some(
        (violation) => violation.contract === 'hosted' && violation.message.includes(message),
      ),
    );
  }
});

test('rejects coordination between peer hosted route modules', async (t) => {
  const { root } = await fixture(t);
  await write(
    root,
    'apps/worldview-service/src/routes/projects.ts',
    "import './maps.js';\nexport const projects = true;\n",
  );
  await write(root, 'apps/worldview-service/src/routes/maps.ts', 'export const maps = true;\n');
  const result = await analyzeRepositoryArchitecture(root, { runCoreTypecheck: false });
  assert.ok(
    result.violations.some(
      (violation) =>
        violation.contract === 'hosted' &&
        violation.message.includes('cannot coordinate through peer route modules'),
    ),
  );
});

test('rejects stale lock metadata and oversized coordination roots', async (t) => {
  const { manifests, root } = await fixture(t, {
    serviceServer: `${'// coordination\n'.repeat(151)}`,
  });
  manifests['apps/viewer'].dependencies.extra = '*';
  await write(root, 'apps/viewer/package.json', `${JSON.stringify(manifests['apps/viewer'])}\n`);
  const result = await analyzeRepositoryArchitecture(root, { runCoreTypecheck: false });
  hasContract(result.violations, 'workspace');
  hasContract(result.violations, 'scale');
});
