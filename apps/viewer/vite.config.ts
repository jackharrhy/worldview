import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { createLocalFixtureResolver } from './local-file-server.js';
import { discoverLocalFixtures } from './local-fixtures.js';

const virtualId = 'virtual:worldview-local-fixtures';
const resolvedVirtualId = `\0${virtualId}`;
const localRoot = fileURLToPath(new URL('./public/local', import.meta.url));
const resolveLocalFixture = createLocalFixtureResolver(localRoot);

function localFixturesPlugin(includeLocalFixtures: boolean): Plugin {
  let generatedModule: Promise<string> | null = null;
  return {
    name: 'worldview-local-fixtures',
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : undefined;
    },
    async load(id) {
      if (id !== resolvedVirtualId) return undefined;
      generatedModule ??= includeLocalFixtures
        ? discoverLocalFixtures(localRoot).then(
            (fixtures) => `export default ${JSON.stringify(fixtures)};`,
          )
        : Promise.resolve('export default [];');
      return generatedModule;
    },
    configureServer(server) {
      // Vite's public-directory middleware does not decode percent-escaped reserved characters
      // in filenames. Quake II legitimately uses names such as +0foo.wal and #teleport.wal, so
      // serve the ignored local corpus through an explicitly bounded filesystem adapter.
      server.middlewares.use((request, response, next) => {
        void (async () => {
          if (request.method !== 'GET' && request.method !== 'HEAD') return next();
          const file = await resolveLocalFixture(request.url ?? '');
          if (!file) return next();
          response.statusCode = 200;
          response.setHeader('Content-Length', file.size);
          response.setHeader('Content-Type', 'application/octet-stream');
          if (request.method === 'HEAD') return response.end();
          createReadStream(file.filename)
            .on('error', (error) => response.destroy(error))
            .pipe(response);
        })().catch(next);
      });
      server.watcher.add(localRoot);
      server.watcher.on('all', (event, filename) => {
        if (
          !['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event) ||
          path.relative(localRoot, filename).startsWith('..') ||
          !/\.(bsp|json|wad|wal|pcx|png|jpe?g|tga)$/i.test(filename)
        ) {
          return;
        }
        generatedModule = null;
        const module = server.moduleGraph.getModuleById(resolvedVirtualId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // The ignored local corpus can be tens of gigabytes. It is served by the bounded development
  // middleware above and must never be copied into a production viewer artifact.
  publicDir: false,
  plugins: [react(), localFixturesPlugin(command === 'serve')],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
}));
