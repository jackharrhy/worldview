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
  const source = await readFile(file, 'utf8');
  const lineCount = physicalLines(source);
  if (lineCount > MAX_PRODUCTION_LINES) {
    violations.push(`${file}: ${lineCount} lines (maximum ${MAX_PRODUCTION_LINES})`);
  }
  if (
    file.endsWith('-presenter.ts') &&
    file !== 'apps/editor/src/editor-application.ts' &&
    /from ['"]\.\/editor-application\.js['"]/.test(source)
  ) {
    violations.push(`${file}: presenters may not depend on the EditorApplication container`);
  }
  if (
    file.startsWith('apps/editor/src/') &&
    /\.(?:ts|tsx)$/.test(file) &&
    /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML\s*\(/.test(source)
  ) {
    violations.push(`${file}: HTML string injection is forbidden; render editor UI with React`);
  }
  if (/\bMapFormat\b/.test(source)) {
    violations.push(
      `${file}: MapFormat conflates document containers with face syntax; use MapDocumentFormat or MapFaceSyntax`,
    );
  }
  if (/\bMapEntity\s*\[\s*['"]brushes['"]\s*\]|\bentity\.brushes\b/.test(source)) {
    violations.push(`${file}: semantic entities own typed primitives, not a brush-only collection`);
  }
  if (/\.primitives\s+as\s+(?:readonly\s+)?MapBrush\[\]/.test(source)) {
    violations.push(`${file}: narrow MapPrimitive by its kind instead of asserting a brush array`);
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
