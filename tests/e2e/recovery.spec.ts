import { expect, test } from './authenticated';
import { resetLink } from '../mailpit';
import type { ActiveSession } from '../../packages/contracts/dist';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('récupère un compte avec un véritable e-mail SMTP puis refuse l’ancien cookie', async ({ page, account, playwright }) => {
  const original = (await page.context().cookies()).find(cookie => cookie.name === 'codeaudit.sid')!;
  await page.context().clearCookies(); await page.goto('/login');
  await page.getByRole('link', { name: 'Mot de passe oublié ?', exact: true }).click();
  await page.getByLabel('Adresse e-mail').fill(account.user.email); await page.getByRole('button', { name: 'Envoyer le lien' }).click();
  await expect(page.getByRole('status')).toContainText('Si un compte correspond');
  const url = await resetLink(account.user.email); await page.goto(url);
  const password = 'A new browser passphrase 2026!';
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password); await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page.getByRole('button', { name: 'Modifier le mot de passe' }).click(); await expect(page.getByRole('status')).toContainText('a été modifié');
  await expect(page).toHaveURL(/\/reset-password$/); expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole('link', { name: 'Retour à la connexion' }).click(); await page.getByLabel('Adresse e-mail').fill(account.user.email); await page.getByLabel('Mot de passe', { exact: true }).fill(password); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  const replay = await playwright.request.newContext(); try { expect((await replay.get(`${apiUrl}/api/projects`, { headers: { Cookie: `codeaudit.sid=${original.value}` } })).status()).toBe(401); } finally { await replay.dispose(); }
});
test('révoque un autre appareil puis toutes les sessions depuis le profil', async ({ page, account, playwright }) => {
  const second = await playwright.request.newContext();
  try {
    expect((await second.post(`${apiUrl}/api/auth/login`, { headers: { 'X-CodeAudit-Request': '1' }, data: { email: account.user.email, password: 'Browser test password 2026!' } })).status()).toBe(200);
    await page.goto('/profile'); await expect(page.getByRole('heading', { name: 'Sessions actives' })).toBeVisible();
    const sessions = await (await page.request.get(`${apiUrl}/api/auth/sessions`)).json() as ActiveSession[]; const other = sessions.find(session => !session.current)!;
    await page.getByRole('button', { name: `Révoquer la session ${other.id.slice(0, 8)}`, exact: true }).click(); await page.getByRole('button', { name: 'Confirmer la révocation' }).click();
    await expect(page.getByRole('status')).toContainText('Session révoquée'); expect((await second.get(`${apiUrl}/api/projects`)).status()).toBe(401);
    await page.getByRole('button', { name: 'Fermer toutes les sessions' }).click(); await page.getByRole('button', { name: 'Confirmer la révocation' }).click();
    await expect(page).toHaveURL(/\/login\?logout=all$/); await expect(page.getByRole('status')).toContainText('Toutes les sessions ont été fermées');
  } finally { await second.dispose(); }
});
