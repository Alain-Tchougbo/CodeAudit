import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { expect, test } from './authenticated';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('importe avec consentement, consulte le code après nettoyage, puis supprime les extraits', async ({ page, request }) => {
  test.setTimeout(60000); let worker: ChildProcess | undefined;
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Context ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201); const { id } = await created.json() as { id: string };
  try {
    await page.goto(`/projects/${id}`); await expect(page.getByRole('checkbox', { name: 'Conserver un aperçu du code pour les diagnostics' })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Conserver un aperçu du code pour les diagnostics' }).check();
    await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'sources.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.js', data: 'export const label = "<img src=x onerror=window.__CODEAUDIT_PREVIEW_EXECUTED__=true>";\nmissing;\n' }]) });
    await page.getByRole('button', { name: 'Lancer l’analyse' }).click();
    worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible({ timeout: 25000 });
    await page.getByText('Voir le code', { exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'Extrait de index.js' })).toContainText('<img src=x onerror=window.__CODEAUDIT_PREVIEW_EXECUTED__=true>');
    await expect(page.locator('tbody img')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(window, '__CODEAUDIT_PREVIEW_EXECUTED__'))).toBeUndefined();
    for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await page.reload(); await page.getByText('Voir le code', { exact: true }).first().click(); await expect(page.getByRole('region', { name: 'Extrait de index.js' })).toContainText('missing;');
    await page.getByRole('button', { name: 'Supprimer les extraits de code', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmer la suppression des extraits' }).click();
    await expect(page.getByText(/Aucun extrait conservé pour cette analyse/)).toBeVisible(); await expect(page.locator('tbody')).toContainText('no-undef');
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204);
  }
});
