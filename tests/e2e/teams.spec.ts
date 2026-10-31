import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { test, expect } from './authenticated';
import { cleanupAccounts } from './auth-admin';
import { invitationLink } from '../mailpit';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
import type { AuthProfile } from '../../packages/contracts/dist';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('partage un vrai rapport par invitation SMTP, puis change et révoque les droits', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(90000); const email = `e2e-${randomUUID()}@example.test`; const teamName = `Platform ${randomUUID().slice(0, 8)}`;
  let teamId: string | undefined; let projectId: string | undefined; let worker: ChildProcess | undefined; let recipient: AuthProfile | undefined;
  const context = await browser.newContext({ baseURL: `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? '5175'}` }); const invited = await context.newPage();
  try {
    await page.goto('/teams'); await page.getByLabel('Nom de l’équipe', { exact: true }).fill(teamName); await page.getByRole('button', { name: 'Créer l’équipe', exact: true }).click(); await expect(page.getByRole('heading', { name: teamName, exact: true })).toBeVisible(); teamId = /\/teams\/([^/?]+)/.exec(page.url())![1]!;
    const created = await request.post(`${apiUrl}/api/projects`, { data: { name: 'Équipe · Code partagé' } }); expect(created.status()).toBe(201); projectId = (await created.json() as { id: string }).id;
    await page.goto(`/projects/${projectId}`); await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'sources.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.js', data: 'missing;' }]) }); await page.getByRole('button', { name: 'Lancer l’analyse', exact: true }).click();
    worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible({ timeout: 25000 }); const analysisId = /\/analyses\/([^/?]+)/.exec(page.url())![1];
    await page.goto(`/projects/${projectId}`); await page.getByLabel('Équipe destinataire').selectOption(teamId); await page.getByRole('button', { name: 'Partager le projet', exact: true }).click(); await page.getByRole('button', { name: 'Confirmer le partage avec l’équipe', exact: true }).click(); await expect(page.getByText('Projet partagé avec', { exact: false })).toBeVisible();
    await page.goto(`/teams/${teamId}`); await page.getByLabel('Adresse e-mail à inviter').fill(email); await page.getByLabel('Rôle proposé').selectOption('READER'); await page.getByRole('button', { name: 'Envoyer l’invitation' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Invitation envoyée' })).toBeVisible();
    const link = new URL(await invitationLink(email)); await invited.goto(`${link.pathname}${link.hash}`); await invited.getByRole('link', { name: 'Créer un compte', exact: true }).click(); expect(invited.url()).not.toContain('token');
    await invited.getByLabel('Nom', { exact: true }).fill('Camille Reader'); await invited.getByLabel('Adresse e-mail').fill(email); await invited.getByLabel('Mot de passe', { exact: true }).fill('Browser test password 2026!');
    const registered = invited.waitForResponse(response => response.url().endsWith('/api/auth/register') && response.request().method() === 'POST'); await invited.getByRole('button', { name: 'Créer mon compte', exact: true }).click(); recipient = await (await registered).json() as AuthProfile;
    await expect(invited.getByRole('heading', { name: teamName, exact: true })).toBeVisible(); await invited.getByRole('button', { name: 'Accepter l’invitation', exact: true }).click(); await expect(invited).toHaveURL(new RegExp(`/teams/${teamId}$`));
    const sharedProject = invited.getByRole('link', { name: /Équipe · Code partagé/ }); await expect(sharedProject).toBeVisible(); await sharedProject.click(); await expect(invited.getByRole('status').filter({ hasText: 'Accès en lecture seule' })).toBeVisible(); await expect(invited.getByRole('button', { name: 'Lancer l’analyse', exact: true })).toHaveCount(0); await expect(invited.getByRole('link', { name: 'Modifier le projet', exact: true })).toHaveCount(0);
    const patch = await invited.request.patch(`${apiUrl}/api/projects/${projectId}`, { headers: { 'X-CodeAudit-Request': '1', 'X-CSRF-Token': recipient.csrfToken }, data: { name: 'Bypass' } }); expect(patch.status()).toBe(403);
    await invited.goto(`/analyses/${analysisId}`); await expect(invited.getByText("'missing' is not defined.", { exact: true })).toBeVisible();
    const report = await invited.request.get(`${apiUrl}/api/analyses/${analysisId}/report`); expect(report.status()).toBe(200); expect((await report.json()).report.statistics.errorCount).toBe(1);
    for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); await page.goto(`/teams/${teamId}`); await expect(page.getByRole('heading', { name: 'Membres', exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await testInfo.attach('team-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.getByRole('combobox', { name: /^Rôle de Camille Reader/ }).selectOption('MEMBER'); await page.getByRole('button', { name: /^Modifier le rôle de Camille Reader/ }).click(); await page.getByRole('button', { name: 'Confirmer la modification du membre', exact: true }).click(); await expect(page.getByRole('combobox', { name: /^Rôle de Camille Reader/ })).toHaveValue('MEMBER');
    await invited.goto(`/projects/${projectId}`); await expect(invited.getByRole('link', { name: 'Modifier le projet', exact: true })).toBeVisible(); await expect(invited.getByRole('button', { name: 'Supprimer le projet', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Retirer Camille Reader/ }).click(); await page.getByRole('button', { name: 'Confirmer la modification du membre', exact: true }).click(); await expect(page.getByRole('button', { name: /^Retirer Camille Reader/ })).toHaveCount(0);
    expect((await invited.request.get(`${apiUrl}/api/analyses/${analysisId}/report`)).status()).toBe(404); await invited.goto(`/projects/${projectId}`); await expect(invited.getByRole('alert')).toContainText('introuvable');
    await page.getByRole('button', { name: /^Retirer Browser test/ }).click(); await page.getByRole('button', { name: 'Confirmer la modification du membre', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('au moins un administrateur');
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    await context.close(); try { if (projectId) await request.delete(`${apiUrl}/api/projects/${projectId}`, { timeout: 5000 }); if (teamId) await request.delete(`${apiUrl}/api/teams/${teamId}`, { timeout: 5000 }); } finally { if (recipient) await cleanupAccounts([recipient.user.id], [email]); }
  }
});
