import { defineConfig } from '@playwright/test';

const performanceChromiumArguments = ['--enable-unsafe-webgpu', '--enable-features=WebGPU'];

// Chromium's own GPU tests use its software Vulkan adapter on headless Linux hosts. Supplying
// ANGLE's SwiftShader flag alone exposes navigator.gpu but destroys the device during pipeline
// creation, so ordinary local and CI browser tests intentionally share this complete flag set.
const headlessChromiumArguments = [
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
      args:
        process.env.WORLDVIEW_PERF_GATE === '1'
          ? performanceChromiumArguments
          : headlessChromiumArguments,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
