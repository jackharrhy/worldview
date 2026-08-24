import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const registry = 'https://registry.npmjs.org/';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectory = path.join(repositoryRoot, 'packages/worldview');

function fail(message) {
  throw new Error(message);
}

function command(commandName, arguments_, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync(commandName, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, npm_config_registry: registry },
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    fail(`${commandName} ${arguments_.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return result;
}

function output(commandName, arguments_) {
  return command(commandName, arguments_, { capture: true }).stdout.trim();
}

function parseArguments(arguments_) {
  let dryRun = false;
  let tag;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--tag') {
      tag = arguments_[index + 1];
      index += 1;
      if (!tag) fail('--tag requires a value');
      continue;
    }
    if (argument.startsWith('--tag=')) {
      tag = argument.slice('--tag='.length);
      if (!tag) fail('--tag requires a value');
      continue;
    }
    fail(`unsupported argument: ${argument}`);
  }
  return { dryRun, tag };
}

function ensureGitState(dryRun) {
  const changes = output('git', ['status', '--porcelain']);
  if (changes && !dryRun) {
    fail('the worktree must be clean before publishing');
  }
  if (changes) console.warn('Dry run includes uncommitted changes.');
  if (dryRun) return;

  const head = output('git', ['rev-parse', 'HEAD']);
  const upstreamResult = command('git', ['rev-parse', '@{upstream}'], {
    allowFailure: true,
    capture: true,
  });
  if (upstreamResult.status !== 0) fail('the current branch does not have an upstream');
  if (head !== upstreamResult.stdout.trim()) {
    fail('the release commit must be pushed before publishing');
  }
}

function publishedVersion(packageName, version) {
  const result = command(
    'npm',
    ['view', `${packageName}@${version}`, 'version', '--json', '--registry', registry],
    { allowFailure: true, capture: true },
  );
  if (result.status === 0) return true;
  const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (/E404|Not Found/i.test(detail)) return false;
  fail(`could not check npm for ${packageName}@${version}:\n${detail.trim()}`);
}

function npmIdentity(expectedIdentity) {
  let result = command('npm', ['whoami', '--registry', registry], {
    allowFailure: true,
    capture: true,
  });
  if (result.status !== 0) {
    console.log('No npm session found. Opening npm login in your browser…');
    command('npm', ['login', '--registry', registry]);
    result = command('npm', ['whoami', '--registry', registry], { capture: true });
  }
  const identity = result.stdout.trim();
  if (identity.toLowerCase() !== expectedIdentity.toLowerCase()) {
    fail(`npm is logged in as ${identity}; expected ${expectedIdentity}`);
  }
  return identity;
}

function parsePackResult(packageName, version) {
  const result = output('npm', [
    'pack',
    '--dry-run',
    '--json',
    '--ignore-scripts',
    '--workspace',
    packageName,
  ]);
  const packages = JSON.parse(result);
  const packed = packages[0];
  if (!packed || packed.name !== packageName || packed.version !== version) {
    fail('npm produced an unexpected package preview');
  }
  const unexpected = packed.files
    .map((file) => file.path)
    .filter(
      (filename) =>
        !filename.startsWith('dist/') &&
        !['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json'].includes(filename),
    );
  if (unexpected.length > 0) {
    fail(`package preview contains unexpected files:\n${unexpected.join('\n')}`);
  }
  return packed;
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function printCandidate({ commit, dryRun, identity, packageName, packed, tag, version }) {
  console.log('\nRelease candidate');
  console.log(`  Package:   ${packageName}`);
  console.log(`  Version:   ${version}`);
  console.log(`  Tag:       ${tag}`);
  console.log(`  Registry:  ${registry}`);
  console.log(`  Commit:    ${commit}`);
  console.log(`  Contents:  ${packed.files.length} files`);
  console.log(`  Tarball:   ${formatBytes(packed.size)}`);
  console.log(`  Unpacked:  ${formatBytes(packed.unpackedSize)}`);
  console.log(`  Publisher: ${identity ?? 'not checked for a dry run'}`);
  console.log(`  Mode:      ${dryRun ? 'dry run' : 'publish'}`);
}

async function confirmPublish(packageName, version, tag) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('publishing requires an interactive terminal');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question(
      `\nType ${version} to publish ${packageName}@${version} with the ${tag} tag: `,
    );
    if (answer.trim() !== version) fail('publication cancelled');
  } finally {
    prompt.close();
  }
}

async function main() {
  const { dryRun, tag: requestedTag } = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
  const packageName = manifest.name;
  const version = manifest.version;
  if (typeof packageName !== 'string' || typeof version !== 'string') {
    fail('the package manifest must contain a name and version');
  }
  const scope = packageName.match(/^@([^/]+)\//)?.[1];
  if (!scope) fail('the published package must have an npm scope');
  const tag = requestedTag ?? (version.includes('-') ? undefined : 'latest');
  if (!tag) fail('prerelease versions require an explicit --tag');

  ensureGitState(dryRun);
  if (publishedVersion(packageName, version)) {
    fail(`${packageName}@${version} is already published`);
  }
  const identity = dryRun ? undefined : npmIdentity(scope);

  console.log('\nRunning release checks…');
  command('npm', ['run', 'release:check']);
  const packed = parsePackResult(packageName, version);
  const commit = output('git', ['rev-parse', '--short', 'HEAD']);
  printCandidate({ commit, dryRun, identity, packageName, packed, tag, version });

  if (dryRun) {
    console.log('\nDry run complete. Nothing was published.');
    return;
  }

  await confirmPublish(packageName, version, tag);
  command('npm', [
    'publish',
    '--workspace',
    packageName,
    '--foreground-scripts',
    '--access',
    'public',
    '--tag',
    tag,
    '--registry',
    registry,
  ]);
  console.log(`\nPublished https://www.npmjs.com/package/${packageName}/v/${version}`);
}

main().catch((error) => {
  console.error(`\nPublish stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
