import { defineConfig } from 'oxlint';

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'error',
    perf: 'warn',
  },
  rules: {
    // Stream readers and the WAD resolver intentionally preserve serial source ordering.
    'no-await-in-loop': 'off',
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'apps/viewer/public/local/**'],
});
