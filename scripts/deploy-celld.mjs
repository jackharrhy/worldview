import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const bucket = process.env.CELLD_BUCKET ?? 'sqlite:///var/lib/celld/object-store/objects.sqlite3';
const celld = process.env.CELLD_BIN ?? join(homedir(), '.local', 'bin', 'celld');
const environment = {
  ...process.env,
  CELLD_BUCKET: bucket,
  CELLD_ESBUILD: join(process.cwd(), 'node_modules', '.bin', 'esbuild'),
};

function run(args, allowFailure = false) {
  const result = spawnSync(celld, args, {
    cwd: process.cwd(),
    env: environment,
    encoding: 'utf8',
    stdio: allowFailure ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(`celld ${args[0]} failed`);
  return result;
}

run(['--version']);
// After SIGKILL the old node lease can briefly outlive its process. Wait for
// that lease to expire before diagnosing the singleton's replacement.
let diagnosis;
for (let attempt = 0; attempt < 30; attempt += 1) {
  diagnosis = run(
    ['diagnose', '--no-control-plane', '--bucket', bucket, '--listen', '127.0.0.1:0'],
    true,
  );
  if (diagnosis.status === 0) break;
  if (attempt < 29) await delay(1_000);
}
if (diagnosis.status !== 0) {
  process.stderr.write(diagnosis.stderr || diagnosis.stdout || 'Celld storage diagnosis failed\n');
  throw new Error('Celld storage diagnosis failed after waiting for recovery');
}
process.stdout.write(diagnosis.stdout);
run(['deploy', 'apps/collaboration-service', '--bucket', bucket]);
console.log(`Deployed Worldview collaboration to ${bucket}`);
