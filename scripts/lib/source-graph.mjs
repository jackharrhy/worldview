import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function collectSourceFiles(directories) {
  const files = [];
  const visit = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (
        entry.isFile() &&
        /\.tsx?$/.test(entry.name) &&
        !entry.name.endsWith('.d.ts') &&
        !/\.(?:test|spec)\.tsx?$/.test(entry.name)
      ) {
        files.push(target);
      }
    }
  };
  for (const directory of directories) await visit(directory);
  return files.toSorted();
}

export async function resolveRelativeSource(importer, specifier, sourceFiles) {
  if (!specifier.startsWith('.')) return null;
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const base = unresolved.replace(/\.(?:c|m)?js$/, '');
  const candidates = [
    unresolved,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (sourceFiles.has(candidate)) return candidate;
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue through the TypeScript source candidates.
    }
  }
  return null;
}

function canonicalCycle(cycle) {
  const body = cycle.slice(0, -1);
  const rotations = body.map((_, index) => body.slice(index).concat(body.slice(0, index)));
  const first = rotations.toSorted((left, right) =>
    left.join('\0').localeCompare(right.join('\0')),
  )[0];
  return [...first, first[0]];
}

export function directedCycles(graph) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = new Map();
  const visit = (node) => {
    if (visited.has(node)) return;
    if (active.has(node)) {
      const start = stack.indexOf(node);
      const cycle = canonicalCycle([...stack.slice(start), node]);
      cycles.set(cycle.join('\0'), cycle);
      return;
    }
    active.add(node);
    stack.push(node);
    for (const dependency of graph.get(node) ?? []) visit(dependency);
    stack.pop();
    active.delete(node);
    visited.add(node);
  };
  for (const node of [...graph.keys()].toSorted()) visit(node);
  return [...cycles.values()];
}

export function packageExportSpecifiers(manifest) {
  if (!manifest.name) return new Set();
  if (manifest.private && manifest.exports === undefined) return new Set();
  if (manifest.exports === null) return new Set();
  const exported = new Set();
  const exportsIsMap =
    manifest.exports && typeof manifest.exports === 'object' && !Array.isArray(manifest.exports);
  const exportKeys = exportsIsMap ? Object.keys(manifest.exports) : [];
  if (exportsIsMap && exportKeys.length === 0) return exported;
  // A conditions object (for example { import, types }) describes the root export. Only keys
  // beginning with a dot are package subpaths.
  const entries = exportKeys.some((entry) => entry.startsWith('.')) ? exportKeys : ['.'];
  for (const entry of entries) {
    if (entry === '.') exported.add(manifest.name);
    else if (entry.startsWith('./') && !entry.includes('*')) {
      exported.add(`${manifest.name}/${entry.slice(2)}`);
    }
  }
  return exported;
}

export function workspaceForSpecifier(workspacesByName, specifier) {
  for (const [name, workspace] of workspacesByName) {
    if (specifier === name || specifier.startsWith(`${name}/`)) return workspace;
  }
  return null;
}

export function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
