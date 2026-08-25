import { defineConfig } from '@playwright/test';

const localChromiumArguments = [
  '--enable-unsafe-webgpu',
  '--enable-features=WebGPU',
  '--use-angle=swiftshader',
];

// Chromium's own GPU tests use its software Vulkan adapter on GPU-less Linux hosts.
const ciChromiumArguments = [
  '--enable-features=Vulkan',
  '--use-angle=swiftshader',
  '--use-vulkan=swiftshader',
  '--use-webgpu-adapter=swiftshader',
  '--disable-vulkan-surface',
  '--enable-unsafe-webgpu',
];

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
    {
      command: 'npm run dev --workspace @worldview/editor -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: process.env.CI ? ciChromiumArguments : localChromiumArguments,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
