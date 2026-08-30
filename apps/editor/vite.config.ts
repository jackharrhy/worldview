import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
      '/api': process.env.WORLDVIEW_SERVICE_ENDPOINT ?? 'http://127.0.0.1:8789',
      '/auth': process.env.WORLDVIEW_SERVICE_ENDPOINT ?? 'http://127.0.0.1:8789',
    },
  },
});
