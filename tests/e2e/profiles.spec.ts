import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { expect, test } from './authenticated';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('enregistre un profil réel et retrouve son choix après analyse et rechargement', async ({ page, request }) => {
  test.setTimeout(60000); let worker: ChildProcess | undefined;
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Profile ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201); const { id } = await created.json() as { id: string };
  try {
    await page.goto(`/projects/${id}`); await page.getByLabel('Profil des prochaines analyses').selectOption('codeaudit-js-ts-strict-v1');
    await page.getByRole('button', { name: 'Enregistrer le profil', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Profil enregistré' })).toBeVisible();
    await page.reload(); await expect(page.getByLabel('Profil des prochaines analyses')).toHaveValue('codeaudit-js-ts-strict-v1');
    await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'sources.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.ts', data: "console.log('hello');" }]) });
    await page.getByRole('button', { name: 'Lancer l’analyse' }).click();
    worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible({ timeout: 25000 });
    await expect(page.locator('tbody')).toContainText('no-console'); await expect(page.locator('tbody')).toContainText('Erreur');
    const analysisId = /\/analyses\/([^/?]+)/.exec(page.url())![1];
    const report = await (await request.get(`${apiUrl}/api/analyses/${analysisId}/report`)).json();
    expect(report.report.profile.version).toBe('codeaudit-js-ts-strict-v1'); expect(report.report.statistics).toMatchObject({ errorCount: 1, warningCount: 0 });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`/projects/${id}`);
      await expect(page.getByLabel('Profil des prochaines analyses')).toHaveValue('codeaudit-js-ts-strict-v1');
      await page.getByText('Voir les règles contrôlées', { exact: true }).click();
      await expect(page.getByText('@typescript-eslint/no-explicit-any', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204);
  }
});
