import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.spec.ts'], exclude: ['test/integration/**'], environment: 'node', maxWorkers: 1, testTimeout: 15000 } });
