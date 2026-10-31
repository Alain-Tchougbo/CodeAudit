import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// Test workers must never reap source directories belonging to the local app.
const storageRoot = resolve('.tmp/playwright-imports');
process.env.CODEAUDIT_STORAGE_ROOT = storageRoot;

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/^\/[^/]+_test$/.test(new URL(databaseUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL doit désigner une base migrée dédiée, dont le nom se termine par _test.');
}
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
const webUrl = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? '5175'}`;

export default defineConfig({
  testDir: './tests/e2e',
  // Real worker processes share the test queue; keep state transitions deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @codeaudit/api start',
      url: `${apiUrl}/health`,
      env: { DATABASE_URL: databaseUrl, PORT: process.env.E2E_API_PORT ?? '3100', CODEAUDIT_STORAGE_ROOT: storageRoot, AUTH_APP_ORIGIN: webUrl, SMTP_HOST: '127.0.0.1', SMTP_PORT: process.env.TEST_SMTP_PORT ?? '1026' },
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @codeaudit/web dev',
      url: webUrl,
      env: { WEB_PORT: process.env.E2E_WEB_PORT ?? '5175', API_PROXY_TARGET: apiUrl },
      reuseExistingServer: false,
    },
  ],
});
