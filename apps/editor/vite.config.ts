import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const serviceEndpoint = process.env.WORLDVIEW_SERVICE_ENDPOINT ?? 'http://127.0.0.1:8789';
const collaborationEndpoint = process.env.WORLDVIEW_COLLABORATION_ENDPOINT;

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
  },
  optimizeDeps: {
    include: [
      'react-aria-components/Checkbox',
      'react-aria-components/Dialog',
      'react-aria-components/Modal',
      'react-aria-components/NumberField',
      'react-aria-components/Select',
      'react-aria-components/Tabs',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': serviceEndpoint,
      '/auth': serviceEndpoint,
      ...(collaborationEndpoint
        ? { '/sync/maps': { target: collaborationEndpoint, ws: true, changeOrigin: true } }
        : {}),
    },
  },
});
