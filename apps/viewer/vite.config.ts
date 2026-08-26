import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { discoverLocalFixtures } from './local-fixtures.js';

const virtualId = 'virtual:worldview-local-fixtures';
const resolvedVirtualId = `\0${virtualId}`;
const localRoot = fileURLToPath(new URL('./public/local', import.meta.url));

function localFixturesPlugin(): Plugin {
  return {
    name: 'worldview-local-fixtures',
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : undefined;
    },
    async load(id) {
      if (id !== resolvedVirtualId) return undefined;
      return `export default ${JSON.stringify(await discoverLocalFixtures(localRoot))};`;
    },
    configureServer(server) {
      server.watcher.add(localRoot);
      server.watcher.on('all', (event, filename) => {
        if (
          !['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event) ||
          path.relative(localRoot, filename).startsWith('..') ||
          !/\.(bsp|json)$/i.test(filename)
        ) {
          return;
        }
        const module = server.moduleGraph.getModuleById(resolvedVirtualId);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localFixturesPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
