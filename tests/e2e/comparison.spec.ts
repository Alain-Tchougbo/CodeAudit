import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { expect, test } from './authenticated';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
import type { AnalysisComparison } from '../../packages/contracts/dist';

const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('compare deux vrais rapports depuis l’historique, filtre, inverse et conserve les exports', async ({ page, request }, testInfo) => {
  test.setTimeout(60000);
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Comparaison ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201);
  const { id: projectId } = await created.json() as { id: string }; let worker: ChildProcess | undefined;
  try {
    const enqueue = async (source: string) => {
      const response = await request.post(`${apiUrl}/api/projects/${projectId}/analyses`, { multipart: { archive: { name: 'project.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.js', data: source }]) } } });
      expect(response.status()).toBe(202); return (await response.json() as { id: string }).id;
    };
    const baselineId = await enqueue('missing;\nconsole.log("baseline");');
    const targetId = await enqueue('\nmissing;\ndebugger;');
    worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
    await expect.poll(async () => (await (await request.get(`${apiUrl}/api/analyses/${targetId}`)).json() as { status: string }).status, { timeout: 25000 }).toBe('SUCCEEDED');
    const baselineExport = await (await request.get(`${apiUrl}/api/analyses/${baselineId}/report`)).json();
    const targetExport = await (await request.get(`${apiUrl}/api/analyses/${targetId}/report`)).json();
    await page.goto(`/projects/${projectId}`);
    await page.getByRole('checkbox', { name: new RegExp(targetId.slice(0, 8)) }).check();
    await page.getByRole('checkbox', { name: new RegExp(baselineId.slice(0, 8)) }).check();
    await page.getByRole('link', { name: 'Comparer les analyses', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/analyses/${targetId}/compare\\?baseline=${baselineId}`));
    await expect(page.getByRole('heading', { name: 'Comparaison des analyses', exact: true })).toBeVisible();
    await expect(page.locator('tbody')).toContainText('no-debugger');
    const result = await (await request.get(`${apiUrl}/api/analyses/${targetId}/comparison?baselineId=${baselineId}`)).json() as AnalysisComparison;
    expect(result.counts).toEqual({ added: 1, persistent: 1, resolved: 1, moved: 1 });
    for (const label of ['Nouveaux problèmes', 'Problèmes persistants', 'Problèmes résolus', 'Positions modifiées']) await expect(page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('dd').first()).toHaveText('1');
    await page.getByRole('button', { name: 'Persistants (1)', exact: true }).click(); await expect(page.locator('tbody')).toContainText('no-undef'); await expect(page.locator('tbody')).toContainText('Ligne 2');
    await page.getByRole('button', { name: 'Résolus (1)', exact: true }).click(); await expect(page.locator('tbody')).toContainText('no-console');
    await page.getByLabel('Gravité', { exact: true }).selectOption('error'); await expect(page.getByText('Aucun problème ne correspond aux filtres.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click(); await expect(page.locator('tbody tr')).toHaveCount(1);
    for (const width of [1440, 768, 390, 320]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
    await testInfo.attach('comparison-mobile', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.getByRole('link', { name: 'Inverser', exact: true }).click(); await expect(page.locator('tbody')).toContainText('no-console');
    await page.reload(); await expect(page.locator('tbody')).toContainText('no-console');
    expect(await (await request.get(`${apiUrl}/api/analyses/${baselineId}/report`)).json()).toEqual(baselineExport);
    expect(await (await request.get(`${apiUrl}/api/analyses/${targetId}/report`)).json()).toEqual(targetExport);
    await page.goto(`/analyses/${targetId}/compare?baseline=${randomUUID()}`); await expect(page.getByRole('alert')).toContainText('Analyse introuvable.'); await expect(page.locator('.metrics-strip')).toHaveCount(0);
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    expect((await request.delete(`${apiUrl}/api/projects/${projectId}`)).status()).toBe(204);
  }
});
