import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  webServer: [
    {
      command: 'npm run dev --workspace @worldview/viewer',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node tests/browser/serve-static.mjs',
      url: 'http://127.0.0.1:4173/standalone.html',
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--use-angle=swiftshader'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
