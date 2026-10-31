import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { AuthProfile } from '../../packages/contracts/dist';
import { cleanupAccounts, expireSessions } from './auth-admin';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
const password = 'A browser test passphrase 2026!';
const ids: string[] = []; const emails: string[] = [];
test.afterEach(async () => { await cleanupAccounts(ids.splice(0), emails.splice(0)); });

test('inscription responsive, profil, rechargement, deconnexion et reconnexion', async ({ page }) => {
  const email = `browser-${randomUUID()}@example.test`; emails.push(email);
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/projects/new'); await expect(page).toHaveURL(/\/login/);
  await page.getByRole('link', { name: 'Créer un compte', exact: true }).click(); await page.getByLabel('Nom', { exact: true }).fill('Alice Browser'); await page.getByLabel('Adresse e-mail').fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  const created = page.waitForResponse((response) => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer mon compte' }).click(); const response = await created; expect(response.status()).toBe(201); const profile = await response.json() as AuthProfile; ids.push(profile.user.id);
  await expect(page).toHaveURL(/\/projects\/new$/); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const cookie = (await page.context().cookies()).find((item) => item.name === 'codeaudit.sid')!; expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie.includes('codeaudit.sid'))).toBe(false);
  await page.getByRole('link', { name: 'Mon profil' }).click(); await expect(page.getByRole('definition').filter({ hasText: email })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Mon profil', exact: true, level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Se déconnecter' }).click(); await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get(`${apiUrl}/api/projects`, { headers: { Cookie: `codeaudit.sid=${cookie.value}` } })).status()).toBe(401);
  await page.getByLabel('Adresse e-mail').fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(password); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
});

test('traite une expiration reelle cote serveur et permet de se reconnecter', async ({ page }) => {
  const email = `expired-${randomUUID()}@example.test`; emails.push(email);
  const response = await page.request.post(`${apiUrl}/api/auth/register`, { headers: { 'X-CodeAudit-Request': '1' }, data: { name: 'Expired user', email, password } }); expect(response.status()).toBe(201); const profile = await response.json() as AuthProfile; ids.push(profile.user.id);
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible(); await expireSessions(profile.user.id);
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click(); await expect(page).toHaveURL(/\/login\?/); await expect(page.getByRole('status')).toContainText('session a expiré');
  await page.getByLabel('Adresse e-mail').fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(password); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
});

test('affiche les identifiants invalides et ne montre jamais le projet d’un autre compte', async ({ page, request }) => {
  const aEmail = `owner-${randomUUID()}@example.test`; const bEmail = `other-${randomUUID()}@example.test`; emails.push(aEmail, bEmail);
  const aResponse = await request.post(`${apiUrl}/api/auth/register`, { headers: { 'X-CodeAudit-Request': '1' }, data: { name: 'Owner', email: aEmail, password } }); expect(aResponse.status()).toBe(201); const a = await aResponse.json() as AuthProfile; ids.push(a.user.id);
  const projectResponse = await request.post(`${apiUrl}/api/projects`, { headers: { 'X-CodeAudit-Request': '1', 'X-CSRF-Token': a.csrfToken }, data: { name: 'Private A project', description: 'Private A description' } }); expect(projectResponse.status()).toBe(201); const project = await projectResponse.json() as { id: string };
  const bResponse = await request.post(`${apiUrl}/api/auth/register`, { headers: { 'X-CodeAudit-Request': '1' }, data: { name: 'Other', email: bEmail, password } }); expect(bResponse.status()).toBe(201); const b = await bResponse.json() as AuthProfile; ids.push(b.user.id);
  await page.goto('/login'); await page.getByLabel('Adresse e-mail').fill(bEmail); await page.getByLabel('Mot de passe', { exact: true }).fill('Incorrect passphrase 2026!'); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('incorrect');
  await page.getByLabel('Mot de passe', { exact: true }).fill(password); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  await page.goto(`/projects/${project.id}`); await expect(page.getByRole('alert')).toContainText('Projet introuvable.'); await expect(page.getByText('Private A description', { exact: true })).toHaveCount(0);
  const profile = await (await page.request.get(`${apiUrl}/api/auth/me`)).json() as AuthProfile;
  expect((await page.request.patch(`${apiUrl}/api/projects/${project.id}`, { headers: { 'X-CodeAudit-Request': '1', 'X-CSRF-Token': profile.csrfToken }, data: { name: 'Stolen' } })).status()).toBe(404);
  expect((await page.request.delete(`${apiUrl}/api/projects/${project.id}`, { headers: { 'X-CodeAudit-Request': '1', 'X-CSRF-Token': profile.csrfToken } })).status()).toBe(404);
});
