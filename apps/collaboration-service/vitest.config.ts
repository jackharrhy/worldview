import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { WORLDVIEW_TICKET_SECRET: 'test-worldview-realtime-ticket-secret-0001' },
      },
    }),
  ],
  test: { include: ['test/**/*.test.ts'] },
});
