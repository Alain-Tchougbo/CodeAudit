import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/^\/[^/]+_test$/.test(new URL(databaseUrl).pathname)) {
  throw new Error('TEST_DATABASE_URL doit désigner une base migrée dédiée, dont le nom se termine par _test.');
}
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
const webUrl = `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? '5175'}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @codeaudit/api start',
      url: `${apiUrl}/health`,
      env: { DATABASE_URL: databaseUrl, PORT: process.env.E2E_API_PORT ?? '3100' },
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
