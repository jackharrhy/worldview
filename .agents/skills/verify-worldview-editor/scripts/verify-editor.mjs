#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';

const ROOT = new URL('../../../../', import.meta.url).pathname;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function usage() {
  console.log(`Usage: verify-editor.mjs [--map PATH] [--evidence PATH] [--url URL] [--no-build] [--headed]

Loads the real editor, registers its WebMCP tools, performs select/translate/undo, and captures proof.`);
}

function argumentsFrom(argv) {
  const result = {
    build: true,
    headed: false,
    map: null,
    evidence: null,
    url: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') return { ...result, help: true };
    if (argument === '--no-build') result.build = false;
    else if (argument === '--headed') result.headed = true;
    else if (['--map', '--evidence', '--url'].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}`)),
    );
  });
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a port');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null)
      throw new Error(`Vite exited before readiness (${child.exitCode})`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcessGroup(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5_000)]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  }
}

async function executeTool(page, name, input = {}) {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tool = window.worldviewVerificationTools.get(toolName);
      if (!tool) throw new Error(`WebMCP tool ${toolName} was not registered`);
      return tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

async function sourceDigest(page) {
  return page.evaluate(async () => {
    const tool = window.worldviewVerificationTools.get('worldview_get_map_source');
    if (!tool) throw new Error('worldview_get_map_source was not registered');
    let offset = 0;
    let text = '';
    while (true) {
      const part = await tool.execute({
        mode: 'save',
        offset,
        maxChars: 100_000,
      });
      if (typeof part.text !== 'string') throw new Error(`Save source is ${part.saveStatus}`);
      text += part.text;
      offset += part.text.length;
      if (!part.truncated) break;
    }
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return {
      chars: text.length,
      sha256: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    };
  });
}

const options = argumentsFrom(process.argv.slice(2));
if (options.help) {
  usage();
  process.exit(0);
}
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const evidence = options.evidence ?? `${ROOT}artifacts/verification/editor/${timestamp}`;
await mkdir(evidence, { recursive: true });

let vite = null;
let browser = null;
const browserLog = [];
const report = {
  startedAt: new Date().toISOString(),
  evidence,
  input: {},
  actions: [],
};
const cleanup = async () => {
  await browser?.close().catch(() => {});
  browser = null;
  await stopProcessGroup(vite);
  vite = null;
};
process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));
process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)));

try {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error(
      `Node 24+ is required by this repository; current runtime is ${process.version}`,
    );
  }
  if (options.build) {
    await run('npm', ['run', 'build', '--workspace', '@jackharrhy/worldview']);
    await run('npm', ['run', 'build', '--workspace', '@jackharrhy/worldview-editor']);
  }

  let url = options.url;
  if (!url) {
    const port = await availablePort();
    url = `http://127.0.0.1:${port}`;
    vite = spawn(
      'npm',
      [
        'run',
        'dev',
        '--workspace',
        '@worldview/editor',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    vite.stdout.on('data', (chunk) => process.stdout.write(chunk));
    vite.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }
  report.url = url;
  await waitForHttp(url, vite);

  browser = await chromium.launch({
    headless: !options.headed,
    args: [
      '--enable-features=Vulkan',
      '--use-angle=swiftshader',
      '--use-vulkan=swiftshader',
      '--use-webgpu-adapter=swiftshader',
      '--disable-vulkan-surface',
      '--enable-unsafe-webgpu',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on('console', (message) => browserLog.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) =>
    browserLog.push({ type: 'pageerror', text: error.stack ?? error.message }),
  );
  await page.addInitScript(() => {
    const tools = new Map();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool, registrationOptions) {
          if (registrationOptions?.signal?.aborted) return;
          tools.set(tool.name, tool);
          registrationOptions?.signal?.addEventListener(
            'abort',
            () => {
              if (tools.get(tool.name) === tool) tools.delete(tool.name);
            },
            { once: true },
          );
        },
      },
    });
    Object.defineProperty(window, 'worldviewVerificationTools', {
      configurable: true,
      value: tools,
    });
  });
  await page.goto(url);
  const homeNewMap = page.getByRole('button', { name: 'New map', exact: true });
  if (new URL(url).pathname === '/') await homeNewMap.waitFor();
  if (await homeNewMap.isVisible()) {
    await homeNewMap.click();
    await page.waitForURL((current) => current.pathname.endsWith('/new-map'));
    await page.getByRole('heading', { name: 'New map', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Create map', exact: true }).click();
    await page.waitForURL((current) => current.pathname.endsWith('/editor'));
    report.actions.push({ action: 'create-default-map-from-workspace' });
  }
  await page.locator('html[data-worldview-editor-ready="true"]').waitFor({ timeout: 30_000 });
  if (await page.locator('.viewport-error').isVisible()) {
    const viewportError = await page.locator('.viewport-error').textContent();
    throw new Error(
      `Viewport error is visible: ${viewportError?.trim() || 'unknown renderer error'}`,
    );
  }
  await page
    .locator('html[data-worldview-site-tools="ready"][data-worldview-site-tool-count="21"]')
    .waitFor();

  let inspection = await executeTool(page, 'worldview_inspect_editor');
  if (options.map) {
    const source = await readFile(options.map, 'utf8');
    report.input = {
      path: options.map,
      bytes: Buffer.byteLength(source),
      sha256: createHash('sha256').update(source).digest('hex'),
    };
    const loaded = await executeTool(page, 'worldview_replace_map_source', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: inspection.revision,
      source,
      name: options.map.split('/').at(-1),
      confirmDestructive: true,
    });
    report.actions.push({ action: 'replace-map-source', result: loaded });
    inspection = await executeTool(page, 'worldview_inspect_editor');
  }
  report.actions.push({ action: 'inspect-loaded', result: inspection });
  await page.screenshot({ path: `${evidence}/01-loaded.png`, fullPage: true });

  if (!options.map) {
    if (inspection.counts?.primitives !== 0) {
      throw new Error(`New document contains ${inspection.counts?.primitives} placeholder brushes`);
    }
    const created = await executeTool(page, 'worldview_create_box', {
      expectedDocumentId: inspection.documentId,
      expectedRevision: inspection.revision,
      min: [-64, -64, 0],
      max: [64, 64, 64],
      material: 'DEV_FLOOR',
    });
    report.actions.push({ action: 'create-verification-box', result: created });
    inspection = await executeTool(page, 'worldview_inspect_editor');
  }

  const before = await sourceDigest(page);
  const listed = await executeTool(page, 'worldview_list_objects', {
    kind: 'brush',
    limit: 1,
  });
  const brush = listed.objects?.[0];
  if (!brush) throw new Error('Loaded document has no editable brush to verify');
  await executeTool(page, 'worldview_select', {
    expectedDocumentId: inspection.documentId,
    expectedRevision: inspection.revision,
    mode: 'objects',
    brushIds: [brush.id],
    entityIds: [],
  });
  await executeTool(page, 'worldview_frame_view', { target: 'selection' });
  const edited = await executeTool(page, 'worldview_translate_selection', {
    expectedDocumentId: inspection.documentId,
    expectedRevision: inspection.revision,
    delta: [16, 0, 0],
    textureLock: true,
  });
  report.actions.push({ action: 'translate-selection', brush, result: edited });
  await page.waitForFunction(
    (revision) => document.querySelector('#document-revision')?.textContent === String(revision),
    edited.revision,
  );
  await page.locator('#status-message').filter({ hasText: 'Site tool: translated' }).waitFor();
  await page.screenshot({ path: `${evidence}/02-edited.png`, fullPage: true });

  const undone = await executeTool(page, 'worldview_history', {
    expectedDocumentId: inspection.documentId,
    expectedRevision: edited.revision,
    action: 'undo',
  });
  const after = await sourceDigest(page);
  report.actions.push({ action: 'undo', result: undone });
  report.source = {
    before,
    after,
    restoredExactly: before.sha256 === after.sha256 && before.chars === after.chars,
  };
  if (!report.source.restoredExactly) throw new Error('Undo did not restore the exact save source');
  await page.screenshot({ path: `${evidence}/03-undone.png`, fullPage: true });

  const gpuValidationMessages = browserLog.filter(
    (entry) =>
      entry.type === 'warning' &&
      /(invalid commandbuffer|attachment state|while encoding|while calling \[queue\])/i.test(
        entry.text,
      ),
  );
  if (gpuValidationMessages.length > 0) {
    throw new Error(`WebGPU validation failed: ${gpuValidationMessages[0].text}`);
  }

  report.finishedAt = new Date().toISOString();
  report.status = 'passed';
  await writeFile(`${evidence}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${evidence}/console.json`, `${JSON.stringify(browserLog, null, 2)}\n`);
  console.log(`Verification passed. Evidence: ${evidence}`);
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.status = 'failed';
  report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await writeFile(`${evidence}/report.json`, `${JSON.stringify(report, null, 2)}\n`).catch(
    () => {},
  );
  await writeFile(`${evidence}/console.json`, `${JSON.stringify(browserLog, null, 2)}\n`).catch(
    () => {},
  );
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
