import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.spec.ts'], environment: 'node', maxWorkers: 1, testTimeout: 15000 },
});
