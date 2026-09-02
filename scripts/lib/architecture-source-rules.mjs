import path from 'node:path';

import { interfacePropertyNames } from './source-analysis.mjs';
import { isWithin, workspaceForSpecifier } from './source-graph.mjs';

const MAX_PRODUCTION_LINES = 1_000;
const MAX_HOSTED_ROUTE_LINES = 200;

// Coordination roots get a tighter budget than ordinary production modules because they are the
// places most likely to accumulate unrelated policy and lifecycle work.
const COORDINATION_LIMITS = new Map([
  ['packages/worldview/src/viewer/viewer.ts', 800],
  ['packages/worldview-editor/src/core/session.ts', 650],
  ['apps/viewer/src/viewer-controller.ts', 650],
  ['apps/collaboration-service/src/map-cell.ts', 500],
  ['apps/worldview-service/src/database.ts', 800],
  ['apps/worldview-service/src/server.ts', 150],
]);

const RAW_BUFFER_FILES = new Set([
  // Focused bulk-upload helpers own the viewer and editor's raw buffer allocation details.
  'packages/worldview/src/render/gpu-buffer.ts',
  // Capture buffers must expose MAP_READ, which is a narrow WebGPU transfer boundary.
  'packages/worldview/src/render/world-render-targets.ts',
  // Editor geometry uses the same focused immutable/infrequent bulk-upload boundary.
  'packages/worldview-editor/src/render/gpu-buffer.ts',
]);

const RAW_BUFFER_WRITE_FILES = new Set([
  // Sprite quads are camera-facing dynamic data rewritten once per requested frame.
  'packages/worldview/src/render/sprite-renderer.ts',
  // The editor's focused bulk-upload helper owns immutable and infrequently replaced writes.
  'packages/worldview-editor/src/render/gpu-buffer.ts',
]);

const RAW_COMMAND_FILES = new Set([
  // Each renderer facade owns the one command encoder and queue submission for its frame.
  'packages/worldview/src/render/renderer.ts',
  'packages/worldview-editor/src/render/source-renderer.ts',
]);
const NO_RAW_FILES = new Set();

const SERVICE_REQUEST_CONTEXT_FIELDS = [
  'publicOrigin',
  'request',
  'response',
  'secureCookies',
  'url',
];

function physicalLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

function lineOf(source, expression) {
  const match = expression.exec(source);
  return match ? source.slice(0, match.index).split('\n').length : 1;
}

function relative(root, filename) {
  return path.relative(root, filename).split(path.sep).join('/');
}

function addSourceViolation(violations, contract, root, filename, source, expression, message) {
  violations.push({
    contract,
    message: `${relative(root, filename)}:${lineOf(source, expression)}: ${message}`,
  });
}

function checkCoreBoundary({ violations, root, sourceRecords, directory, label }) {
  for (const [filename, record] of sourceRecords) {
    if (!isWithin(directory, filename)) continue;
    for (const reference of record.references) {
      if (/^(?:react(?:-dom)?|typegpu|@webgpu\/types)(?:\/|$)/.test(reference.specifier)) {
        addSourceViolation(
          violations,
          'core',
          root,
          filename,
          record.source,
          new RegExp(RegExp.escape(reference.specifier)),
          `${label} cannot import ${reference.specifier}`,
        );
      }
      const resolved = reference.specifier.startsWith('.')
        ? record.resolved.get(reference.specifier)
        : null;
      if (resolved && !isWithin(directory, resolved)) {
        violations.push({
          contract: 'core',
          message: `${relative(root, filename)}: ${label} cannot import ${relative(root, resolved)}`,
        });
      }
    }
  }
}

function checkRendererOwnership({ violations, root, sourceRecords }) {
  const rendererRoots = [
    path.join(root, 'packages/worldview/src/render'),
    path.join(root, 'packages/worldview-editor/src/render'),
  ];
  const rawResource =
    /(?:\bdevice|\.device)\.create(?:Texture|Sampler|BindGroup|RenderPipeline(?:Async)?)\s*\(|\.create(?:BindGroupLayout|PipelineLayout|ShaderModule)\s*\(/;
  const rawBuffer = /(?:\bdevice|\.device)\.createBuffer\s*\(/;
  const rawWrite = /(?:\bdevice|\.device)\.queue\.writeBuffer\s*\(/;
  const rawCommand =
    /(?:\bdevice|\.device)\.createCommandEncoder\s*\(|(?:\bdevice|\.device)\.queue\.submit\s*\(/;
  const rawShader = /\/\*\s*wgsl\s*\*\/|\bGPUShaderModule\b/;
  for (const [filename, { source }] of sourceRecords) {
    if (!rendererRoots.some((directory) => isWithin(directory, filename))) continue;
    const file = relative(root, filename);
    for (const [expression, allowed, message] of [
      [rawResource, NO_RAW_FILES, 'GPU resources must be created through TypeGPU'],
      [rawBuffer, RAW_BUFFER_FILES, 'raw buffers are limited to named bulk transfer boundaries'],
      [
        rawWrite,
        RAW_BUFFER_WRITE_FILES,
        'raw buffer writes are limited to named bulk transfer boundaries',
      ],
      [
        rawCommand,
        RAW_COMMAND_FILES,
        'command encoding and submission belong to the renderer frame facade',
      ],
      [rawShader, NO_RAW_FILES, 'shaders and shader modules must be declared through TypeGPU'],
    ]) {
      if (expression.test(source) && !allowed.has(file)) {
        addSourceViolation(violations, 'gpu', root, filename, source, expression, message);
      }
    }
  }
}

function checkHostedService({ violations, root, sourceRecords }) {
  const serviceRoot = path.join(root, 'apps/worldview-service/src');
  const routesRoot = path.join(serviceRoot, 'routes');
  for (const [filename, record] of sourceRecords) {
    if (!isWithin(serviceRoot, filename)) continue;
    const file = relative(root, filename);
    if (
      record.references.some(({ specifier }) =>
        /^(?:react(?:-dom)?|typegpu|@webgpu\/types)(?:\/|$)/.test(specifier),
      )
    ) {
      violations.push({
        contract: 'hosted',
        message: `${file}: the hosted service cannot depend on browser UI or GPU runtimes`,
      });
    }
    if (
      /\bdefineRoute\s*\(/.test(record.source) &&
      !isWithin(routesRoot, filename) &&
      file !== 'apps/worldview-service/src/service-routing.ts'
    ) {
      violations.push({
        contract: 'hosted',
        message: `${file}: HTTP route declarations belong in focused modules under src/routes`,
      });
    }
    if (isWithin(routesRoot, filename) && path.basename(filename) !== 'index.ts') {
      for (const resolved of record.resolved.values()) {
        if (resolved && isWithin(routesRoot, resolved)) {
          violations.push({
            contract: 'hosted',
            message: `${file}: domain route modules cannot coordinate through peer route modules`,
          });
        }
      }
      const lines = physicalLines(record.source);
      if (lines > MAX_HOSTED_ROUTE_LINES) {
        violations.push({
          contract: 'scale',
          message: `${file}: ${lines} lines; focused route modules may use at most ${MAX_HOSTED_ROUTE_LINES}`,
        });
      }
    }
  }
  const contextFile = path.join(serviceRoot, 'service-http.ts');
  const contextSource = sourceRecords.get(contextFile)?.source;
  const contextFields = contextSource
    ? interfacePropertyNames(contextFile, contextSource, 'ServiceRequestContext')
    : null;
  if (
    !contextFields ||
    contextFields.toSorted().join('\0') !== SERVICE_REQUEST_CONTEXT_FIELDS.join('\0')
  ) {
    violations.push({
      contract: 'hosted',
      message: `apps/worldview-service/src/service-http.ts: ServiceRequestContext must contain only ${SERVICE_REQUEST_CONTEXT_FIELDS.join(', ')}`,
    });
  }
}

function checkLayerDirection({ violations, root, sourceRecords }) {
  const rules = [
    {
      root: path.join(root, 'packages/worldview/src/render'),
      forbidden: ['/viewer/', '/element/'],
      label: 'the compiled-world renderer',
    },
    {
      root: path.join(root, 'packages/worldview/src/runtime'),
      forbidden: ['/render/', '/viewer/', '/element/', '/walkability/'],
      label: 'shared runtime helpers',
    },
    {
      root: path.join(root, 'packages/worldview/src/walkability'),
      forbidden: ['/render/', '/viewer/', '/element/'],
      label: 'GPU-independent walkability',
    },
  ];
  for (const [filename, record] of sourceRecords) {
    for (const rule of rules) {
      if (!isWithin(rule.root, filename)) continue;
      for (const resolved of record.resolved.values()) {
        if (!resolved) continue;
        const target = `/${relative(root, resolved)}`;
        if (rule.forbidden.some((segment) => target.includes(segment))) {
          violations.push({
            contract: 'dependencies',
            message: `${relative(root, filename)}: ${rule.label} cannot import ${relative(root, resolved)}`,
          });
        }
      }
    }
  }
}

function checkCoordinationScale({ violations, root, sourceRecords }) {
  for (const [filename, { source }] of sourceRecords) {
    const file = relative(root, filename);
    const lines = physicalLines(source);
    if (lines > MAX_PRODUCTION_LINES) {
      violations.push({
        contract: 'scale',
        message: `${file}: ${lines} lines; production modules may use at most ${MAX_PRODUCTION_LINES}`,
      });
    }
    const focusedLimit = COORDINATION_LIMITS.get(file);
    if (focusedLimit && lines > focusedLimit) {
      violations.push({
        contract: 'scale',
        message: `${file}: ${lines} lines; this coordination root may use at most ${focusedLimit}`,
      });
    }
  }
}

export function checkSourceArchitecture({ violations, root, sourceRecords, workspacesByName }) {
  for (const [filename, record] of sourceRecords) {
    const file = relative(root, filename);
    if (
      file.startsWith('packages/') &&
      record.references.some(({ specifier }) => /^(?:react(?:-dom)?)(?:\/|$)/.test(specifier))
    ) {
      violations.push({
        contract: 'dependencies',
        message: `${file}: React belongs in applications, not framework-independent packages`,
      });
    }
    if (file.startsWith('apps/viewer/src/')) {
      for (const reference of record.references) {
        const target = workspaceForSpecifier(workspacesByName, reference.specifier);
        if (target && target.manifest.name !== '@jackharrhy/worldview') {
          violations.push({
            contract: 'viewer',
            message: `${file}: the viewer fixture app may consume @jackharrhy/worldview public entrypoints only, not ${target.manifest.name}`,
          });
        }
      }
    }
    if (file.startsWith('packages/worldview-editor/src/')) {
      for (const reference of record.references) {
        if (
          reference.specifier.startsWith('@jackharrhy/worldview') &&
          reference.specifier !== '@jackharrhy/worldview/core' &&
          reference.specifier !== '@jackharrhy/worldview/runtime'
        ) {
          violations.push({
            contract: 'dependencies',
            message: `${file}: the editor package may share only GPU-independent worldview core/runtime entrypoints`,
          });
        }
      }
    }
  }

  checkCoreBoundary({
    violations,
    root,
    sourceRecords,
    directory: path.join(root, 'packages/worldview/src/core'),
    label: 'viewer core',
  });
  checkCoreBoundary({
    violations,
    root,
    sourceRecords,
    directory: path.join(root, 'packages/worldview-editor/src/core'),
    label: 'editor core',
  });
  checkLayerDirection({ violations, root, sourceRecords });
  checkRendererOwnership({ violations, root, sourceRecords });
  checkHostedService({ violations, root, sourceRecords });
  checkCoordinationScale({ violations, root, sourceRecords });
}
