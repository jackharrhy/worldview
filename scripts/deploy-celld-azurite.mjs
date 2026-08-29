import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

const account = 'devstoreaccount1';
const accountKey =
  'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const bucket = process.env.CELLD_BUCKET ?? 'worldview-celld';
const endpoint = process.env.AZURITE_BLOB_ENDPOINT ?? `http://127.0.0.1:10000/${account}`;
const celld = process.env.CELLD_BIN ?? join(homedir(), '.local', 'bin', 'celld');
const expectedVersion = 'celld 0.4.0';
const environment = {
  ...process.env,
  AZURE_STORAGE_USE_EMULATOR: 'true',
  AZURE_STORAGE_ACCOUNT_NAME: account,
  CELLD_ESBUILD: join(process.cwd(), 'node_modules', '.bin', 'esbuild'),
};

function run(args, capture = false) {
  const result = spawnSync(celld, args, {
    cwd: process.cwd(),
    env: environment,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `${celld} ${args.join(' ')} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
    );
  }
  return result.stdout?.trim() ?? '';
}

const version = run(['--version'], true);
if (version !== expectedVersion) {
  throw new Error(`Expected ${expectedVersion}, received ${version}`);
}

const credential = new StorageSharedKeyCredential(account, accountKey);
const storage = new BlobServiceClient(endpoint, credential);
await storage.getContainerClient(bucket).createIfNotExists();

const bucketUrl = `az://${bucket}`;
run(['diagnose', '--bucket', bucketUrl, '--listen', '127.0.0.1:0']);
run(['deploy', 'apps/collaboration-service', '--bucket', bucketUrl]);
console.log(`Deployed Worldview collaboration to ${bucketUrl} through ${endpoint}`);
