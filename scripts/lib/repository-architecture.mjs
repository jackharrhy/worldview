import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { checkSourceArchitecture } from './architecture-source-rules.mjs';
import { moduleReferences } from './source-analysis.mjs';
import {
  collectSourceFiles,
  directedCycles,
  isWithin,
  packageExportSpecifiers,
  resolveRelativeSource,
  workspaceForSpecifier,
} from './source-graph.mjs';

export const ARCHITECTURE_CONTRACTS = {
  core: 'docs/plan.md#repository-boundaries',
  dependencies: 'docs/plan.md#repository-boundaries',
  gpu: 'docs/plan.md#repository-boundaries',
  hosted: 'docs/plan.md#hosted-projects',
  scale: 'docs/plan.md#repository-boundaries',
  viewer: 'docs/plan.md#viewer-architecture',
  workspace: 'docs/plan.md#repository-boundaries',
};

const MANIFEST_LOCK_FIELDS = [
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

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

function relative(root, filename) {
  return path.relative(root, filename).split(path.sep).join('/');
}

async function workspaceDirectories(root, patterns, violations) {
  const directories = [];
  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      violations.push({
        contract: 'workspace',
        message: `unsupported workspace pattern ${pattern}; architecture discovery requires a trailing /*`,
      });
      continue;
    }
    const parent = path.join(root, pattern.slice(0, -2));
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const directory = path.join(parent, entry.name);
      if (entry.isDirectory() && (await exists(path.join(directory, 'package.json')))) {
        directories.push(directory);
      }
    }
  }
  return directories.toSorted();
}

function workspaceForFile(workspaces, filename) {
  return workspaces.find(({ sourceRoot }) => isWithin(sourceRoot, filename));
}

function runtimeDependencies(manifest) {
  return {
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
    ...manifest.dependencies,
  };
}

function declaredDependencies(manifest) {
  return {
    ...manifest.devDependencies,
    ...runtimeDependencies(manifest),
  };
}

function checkLockEntry(violations, label, manifest, locked) {
  if (!locked) {
    violations.push({
      contract: 'workspace',
      message: `${label} is missing from package-lock.json`,
    });
    return;
  }
  for (const field of MANIFEST_LOCK_FIELDS) {
    if (!isDeepStrictEqual(manifest[field], locked[field])) {
      violations.push({
        contract: 'workspace',
        message: `${label} ${field} does not match package-lock.json; run npm install`,
      });
    }
  }
}

export function formatArchitectureViolation(violation) {
  const anchor = ARCHITECTURE_CONTRACTS[violation.contract];
  return `[${violation.contract}] ${violation.message} (contract: ${anchor})`;
}

export async function analyzeRepositoryArchitecture(root, options = {}) {
  const violations = [];
  const rootManifest = await readJson(path.join(root, 'package.json'));
  const lock = await readJson(path.join(root, 'package-lock.json'));
  if (!String(rootManifest.packageManager ?? '').startsWith('npm@')) {
    violations.push({
      contract: 'workspace',
      message: 'packageManager must select npm explicitly',
    });
  }
  for (const alternative of ['bun.lock', 'bun.lockb', 'pnpm-lock.yaml', 'yarn.lock']) {
    if (await exists(path.join(root, alternative))) {
      violations.push({
        contract: 'workspace',
        message: `${alternative} conflicts with package-lock.json as the dependency authority`,
      });
    }
  }
  checkLockEntry(violations, 'root package.json', rootManifest, lock.packages?.['']);

  const directories = await workspaceDirectories(root, rootManifest.workspaces ?? [], violations);
  const workspaces = await Promise.all(
    directories.map(async (directory) => {
      const manifest = await readJson(path.join(directory, 'package.json'));
      return {
        directory,
        sourceRoot: path.join(directory, 'src'),
        manifest,
        exports: packageExportSpecifiers(manifest),
      };
    }),
  );
  for (const workspace of workspaces) {
    checkLockEntry(
      violations,
      `${relative(root, workspace.directory)}/package.json`,
      workspace.manifest,
      lock.packages?.[relative(root, workspace.directory)],
    );
  }
  const workspacesByName = new Map();
  for (const workspace of workspaces) {
    const name = workspace.manifest.name;
    if (typeof name !== 'string' || name.length === 0) {
      violations.push({
        contract: 'workspace',
        message: `${relative(root, workspace.directory)}/package.json: workspace name is required`,
      });
    } else if (workspacesByName.has(name)) {
      violations.push({
        contract: 'workspace',
        message: `${relative(root, workspace.directory)}/package.json: duplicate workspace name ${name}`,
      });
    } else {
      workspacesByName.set(name, workspace);
    }
  }
  const sourceFiles = new Set(
    await collectSourceFiles(workspaces.map(({ sourceRoot }) => sourceRoot)),
  );
  const sourceRecords = new Map();
  for (const filename of sourceFiles) {
    const source = await readFile(filename, 'utf8');
    const references = moduleReferences(filename, source);
    const resolved = new Map();
    for (const { specifier } of references) {
      if (specifier.startsWith('.')) {
        resolved.set(specifier, await resolveRelativeSource(filename, specifier, sourceFiles));
      }
    }
    sourceRecords.set(filename, { source, references, resolved });
  }

  const sourceGraph = new Map([...sourceFiles].map((filename) => [filename, new Set()]));
  for (const [filename, record] of sourceRecords) {
    const importer = workspaceForFile(workspaces, filename);
    for (const reference of record.references) {
      const target = workspaceForSpecifier(workspacesByName, reference.specifier);
      if (target && importer) {
        if (target === importer) {
          violations.push({
            contract: 'dependencies',
            message: `${relative(root, filename)}: workspace source must use a relative import instead of its own package entrypoint ${reference.specifier}`,
          });
        } else {
          if (!target.exports.has(reference.specifier)) {
            violations.push({
              contract: 'dependencies',
              message: `${relative(root, filename)}: ${reference.specifier} is not a public package entrypoint`,
            });
          }
          const dependencies = reference.runtime
            ? runtimeDependencies(importer.manifest)
            : declaredDependencies(importer.manifest);
          if (!(target.manifest.name in dependencies)) {
            violations.push({
              contract: 'workspace',
              message: `${relative(root, filename)}: ${target.manifest.name} must be declared as ${reference.runtime ? 'a runtime' : 'a development or runtime'} dependency`,
            });
          }
        }
      }
      const resolved = record.resolved.get(reference.specifier);
      if (resolved) {
        const targetWorkspace = workspaceForFile(workspaces, resolved);
        if (importer && targetWorkspace && importer !== targetWorkspace) {
          violations.push({
            contract: 'dependencies',
            message: `${relative(root, filename)}: cross-workspace relative import reaches ${relative(root, resolved)}; use its public package entrypoint`,
          });
        }
        if (reference.runtime && !reference.dynamic) sourceGraph.get(filename)?.add(resolved);
      }
    }
  }
  for (const cycle of directedCycles(sourceGraph)) {
    violations.push({
      contract: 'dependencies',
      message: `static runtime dependency cycle: ${cycle.map((file) => relative(root, file)).join(' -> ')}`,
    });
  }

  const workspaceGraph = new Map(
    [...workspacesByName].map(([name, { manifest }]) => [
      name,
      new Set(
        Object.keys(runtimeDependencies(manifest)).filter((dependency) =>
          workspacesByName.has(dependency),
        ),
      ),
    ]),
  );
  for (const cycle of directedCycles(workspaceGraph)) {
    violations.push({
      contract: 'dependencies',
      message: `workspace dependency cycle: ${cycle.join(' -> ')}`,
    });
  }

  for (const workspace of workspaces) {
    if (!relative(root, workspace.directory).startsWith('packages/')) continue;
    const dependencies = {
      ...workspace.manifest.dependencies,
      ...workspace.manifest.devDependencies,
      ...workspace.manifest.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      if (/^(?:react(?:-dom)?|@types\/react)(?:\/|$)/.test(dependency)) {
        violations.push({
          contract: 'dependencies',
          message: `${relative(root, workspace.directory)}/package.json: React belongs in applications, not framework-independent packages`,
        });
      }
    }
  }

  checkSourceArchitecture({ violations, root, sourceRecords, workspacesByName });

  if (options.runCoreTypecheck !== false) {
    const executable = path.join(root, 'node_modules/.bin/tsc');
    const result = spawnSync(executable, ['-p', 'tsconfig.architecture-core.json'], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      violations.push({
        contract: 'core',
        message: `DOM-free core typecheck failed${detail ? `:\n${detail}` : ''}`,
      });
    }
  }

  return { violations, sourceFileCount: sourceFiles.size, workspaceCount: workspaces.length };
}
