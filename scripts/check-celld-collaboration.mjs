import { readFile } from 'node:fs/promises';

const configPath = new URL('../apps/collaboration-service/wrangler.jsonc', import.meta.url);
const workerPath = new URL('../apps/collaboration-service/src/', import.meta.url);
const configSource = await readFile(configPath, 'utf8');
const config = JSON.parse(configSource.replace(/,\s*([}\]])/g, '$1'));
const supportedKeys = new Set([
  '$schema',
  'name',
  'main',
  'compatibility_date',
  'compatibility_flags',
  'durable_objects',
  'migrations',
  'assets',
  'services',
  'triggers',
  'vars',
  'd1_databases',
]);
const unsupportedKeys = Object.keys(config).filter((key) => !supportedKeys.has(key));
if (unsupportedKeys.length > 0) {
  throw new Error(`celld rejects Wrangler keys: ${unsupportedKeys.join(', ')}`);
}
const bindings = config.durable_objects?.bindings ?? [];
if (!bindings.some((binding) => binding.name === 'MAP_CELLS' && binding.class_name === 'MapCell')) {
  throw new Error('celld MapCell binding is missing');
}
const migrations = config.migrations ?? [];
if (!migrations.some((migration) => migration.new_sqlite_classes?.includes('MapCell'))) {
  throw new Error('celld SQLite MapCell migration is missing');
}
const sources = await Promise.all(
  ['index.ts', 'map-cell.ts', 'protocol.ts'].map((file) =>
    readFile(new URL(file, workerPath), 'utf8'),
  ),
);
const unsupportedRuntimeBindings = ['KVNamespace', 'R2Bucket', 'Queue<', 'WorkflowEntrypoint'];
for (const binding of unsupportedRuntimeBindings) {
  if (sources.some((source) => source.includes(binding))) {
    throw new Error(`celld collaboration service uses unsupported runtime binding ${binding}`);
  }
}
process.stdout.write('celld collaboration config compatibility passed\n');
