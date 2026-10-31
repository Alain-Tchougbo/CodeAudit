import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { expect, test } from './authenticated';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('configure les seuils et une clé, distingue le refus qualité puis révoque la clé', async ({ page, request, playwright }) => {
  test.setTimeout(60000); let worker: ChildProcess | undefined; const anonymous = await playwright.request.newContext();
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `CI ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201); const { id } = await created.json() as { id: string };
  try {
    await page.goto(`/projects/${id}`); await page.getByText('Seuils qualité', { exact: true }).click(); await page.getByLabel('Appliquer des seuils qualité aux prochaines analyses').check(); await page.getByRole('button', { name: 'Enregistrer les seuils' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Seuils enregistrés' })).toBeVisible();
    await page.getByText('Intégration CI · Clés personnelles', { exact: true }).click(); await page.getByLabel('Nom de la clé CI').fill('Playwright'); await page.getByLabel('Validité en jours').fill('1'); await page.getByRole('button', { name: 'Créer une clé CI' }).click();
    const secret = page.getByLabel('Clé secrète générée'); await expect(secret).toHaveValue(/^ca_[a-f0-9]{64}$/); const token = await secret.inputValue(); await page.getByRole('button', { name: 'Masquer la clé' }).click(); await expect(secret).toHaveCount(0); expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'sources.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.js', data: "console.log('hello');" }]) }); await page.getByRole('button', { name: 'Lancer l’analyse', exact: true }).click();
    worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible({ timeout: 25000 }); await expect(page.getByRole('heading', { name: 'Seuils dépassés', exact: true })).toBeVisible(); await expect(page.getByText('Avertissements : 1 / 0 autorisés · Dépassé', { exact: true })).toBeVisible();
    const analysisUrl = page.url(); const analysisId = /\/analyses\/([^/?]+)/.exec(analysisUrl)![1]; expect((await anonymous.get(`${apiUrl}/api/analyses/${analysisId}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
    await page.goto(`/projects/${id}`); await page.getByText('Intégration CI · Clés personnelles', { exact: true }).click(); await expect(page.getByLabel('Clé secrète générée')).toHaveCount(0); await page.getByRole('button', { name: 'Révoquer la clé Playwright', exact: true }).click(); await page.getByRole('button', { name: 'Confirmer la révocation de clé' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Clé révoquée' })).toBeVisible();
    expect((await anonymous.get(`${apiUrl}/api/analyses/${analysisId}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  } finally {
    await anonymous.dispose(); if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204);
  }
});
