import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const styleRoot = path.resolve('apps/editor/src/styles');
const styleFiles = (await readdir(styleRoot))
  .filter((name) => name.endsWith('.css'))
  .map((name) => path.join(styleRoot, name));
const forbiddenCssColor = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/gi;
const failures = [];
for (const file of styleFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(forbiddenCssColor)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${path.relative(process.cwd(), file)}:${line}: ${match[0]}`);
  }
}
const layout = await readFile(path.join(styleRoot, 'layout.css'), 'utf8');
for (const role of [
  'background',
  'edge',
  'material',
  'selection',
  'hover',
  'locked',
  'face-selected',
  'face-hover',
  'face-handle',
  'reference',
  'reference-edge',
  'axis-x',
  'axis-y',
  'axis-z',
  'accent',
  'danger',
  'success',
  'info',
  'special',
  'grid-minor',
  'grid-major',
]) {
  if (!layout.includes(`--renderer-${role}:`)) failures.push(`missing --renderer-${role}`);
}
if (failures.length > 0) {
  console.error(`Editor theme audit failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(
    `Editor theme audit passed (${styleFiles.length} stylesheets, no legacy color syntax)`,
  );
}
