import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAX_PRODUCTION_LINES = 1_000;
const MAX_COMPOSITION_ROOT_LINES = 100;
const roots = ['apps/editor/src', 'packages/worldview-editor/src'];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(target);
      if (
        !entry.isFile() ||
        (!target.endsWith('.ts') && !target.endsWith('.tsx') && !target.endsWith('.css'))
      )
        return [];
      if (/\.(?:test|spec)\.tsx?$|\.d\.ts$/.test(target)) return [];
      return [target];
    }),
  );
  return files.flat();
}

function physicalLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
}

const files = (await Promise.all(roots.map(sourceFiles))).flat();
const violations = [];
for (const file of files) {
  const lineCount = physicalLines(await readFile(file, 'utf8'));
  if (lineCount > MAX_PRODUCTION_LINES) {
    violations.push(`${file}: ${lineCount} lines (maximum ${MAX_PRODUCTION_LINES})`);
  }
}

const compositionRoot = 'apps/editor/src/main.tsx';
const compositionRootLines = physicalLines(await readFile(compositionRoot, 'utf8'));
if (compositionRootLines > MAX_COMPOSITION_ROOT_LINES) {
  violations.push(
    `${compositionRoot}: ${compositionRootLines} lines (composition roots may use at most ${MAX_COMPOSITION_ROOT_LINES})`,
  );
}

if (violations.length > 0) {
  console.error('Editor architecture limits failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(
    `Editor architecture limits passed for ${files.length} production TS/CSS files (maximum ${MAX_PRODUCTION_LINES} lines).`,
  );
}
