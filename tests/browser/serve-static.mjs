import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const repository = resolve(import.meta.dirname, '../..');
const consumerRoot = resolve(repository, 'tests/consumer/dist');
const routes = new Map([
  ['/', resolve(import.meta.dirname, 'static/standalone.html')],
  ['/standalone.html', resolve(import.meta.dirname, 'static/standalone.html')],
  ['/fixture.js', resolve(import.meta.dirname, 'static/fixture.js')],
  ['/standalone.js', resolve(repository, 'packages/worldview/dist/standalone.js')],
  ['/standalone.js.map', resolve(repository, 'packages/worldview/dist/standalone.js.map')],
]);
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  let file = routes.get(pathname);
  if (!file && pathname.startsWith('/consumer/')) {
    const relative = pathname.slice('/consumer/'.length) || 'index.html';
    const candidate = resolve(consumerRoot, relative);
    if (candidate === consumerRoot || candidate.startsWith(`${consumerRoot}${sep}`))
      file = candidate;
  }
  if (!file) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(4173, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
