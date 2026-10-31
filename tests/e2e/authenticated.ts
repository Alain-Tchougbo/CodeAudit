import { randomUUID } from 'node:crypto';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import type { AuthProfile } from '../../packages/contracts/dist';
import { cleanupAccounts } from './auth-admin';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
export const test = base.extend<{ account: AuthProfile }>({
  account: [async ({ page }, use) => {
    const email = `e2e-${randomUUID()}@example.test`;
    const response = await page.request.post(`${apiUrl}/api/auth/register`, { headers: { 'X-CodeAudit-Request': '1' }, data: { name: 'Browser test', email, password: 'Browser test password 2026!' } });
    expect(response.status()).toBe(201); const profile = await response.json() as AuthProfile;
    try { await use(profile); } finally { await cleanupAccounts([profile.user.id], [email]); }
  }, { auto: true }],
  request: async ({ page, account }, use) => {
    // Only direct API test requests get these headers. Browser code must send its own CSRF token.
    const api = new Proxy(page.request, { get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (['post', 'patch', 'delete', 'put'].includes(String(key))) return (url: string, options: Parameters<APIRequestContext['post']>[1] = {}) => (value as APIRequestContext['post']).call(target, url, { ...options, headers: { ...options.headers, 'X-CodeAudit-Request': '1', 'X-CSRF-Token': account.csrfToken } });
      return value.bind(target);
    } });
    await use(api);
  },
});
export { expect };
