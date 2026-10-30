import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;

test('parcours de demonstration complet depuis Vue, sans simuler les reponses API', async ({ page, request }) => {
  test.setTimeout(60000);
  let projectId: string | undefined;
  let worker: ChildProcess | undefined;
  const name = `Demo ${randomUUID()}`;
  try {
    await test.step('1. Creer le projet depuis le formulaire', async () => {
      await page.goto('/projects/new'); await page.getByLabel('Nom du projet').fill(name);
      await page.getByLabel('Description (facultative)').fill('Parcours reel avant demonstration');
      const created = page.waitForResponse((response) => response.url().endsWith('/api/projects') && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Créer le projet' }).click();
      const response = await created; expect(response.status()).toBe(201); projectId = (await response.json() as { id: string }).id;
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    });
    await test.step('2. Choisir une archive ZIP dans le navigateur', async () => {
      await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'demo.zip', mimeType: 'application/zip', buffer: zip([{ name: 'src/index.js', data: 'missing;\nconsole.log("demo");' }]) });
    });
    let analysisId = '';
    await test.step('3. Lancer l’analyse et verifier sa mise en file reelle', async () => {
      const queued = page.waitForResponse((response) => response.url().endsWith(`/projects/${projectId}/analyses`) && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Lancer l’analyse' }).click(); const response = await queued;
      expect(response.status()).toBe(202); analysisId = (await response.json() as { id: string }).id;
      await expect(page).toHaveURL(new RegExp(`/analyses/${analysisId}$`)); await expect(page.getByText('En attente', { exact: true })).toBeVisible();
    });
    await test.step('4. Suivre l’état avec le vrai worker', async () => {
      worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
      await expect(page.getByText('Terminée', { exact: true })).toBeVisible({ timeout: 25000 });
    });
    await test.step('5. Consulter les resultats persistes apres rechargement', async () => {
      await page.reload(); await expect(page.locator('tbody tr')).toHaveCount(2);
      await expect(page.locator('tbody')).toContainText('src/index.js'); await expect(page.locator('tbody')).toContainText('no-undef');
      await expect(page.locator('tbody')).toContainText('Ligne 1 · Colonne 1');
    });
    await test.step('6. Combiner les filtres de diagnostics', async () => {
      await page.getByLabel('Gravité', { exact: true }).selectOption('warning');
      await page.getByLabel('Nom de fichier').fill('INDEX.JS'); await page.getByLabel('Règle ESLint', { exact: true }).selectOption('no-console');
      await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody')).toContainText('no-console');
    });
    await test.step('7. Consulter l’historique et rouvrir la meme analyse', async () => {
      await page.getByRole('link', { name: 'Voir le projet et son historique' }).click();
      const old = page.locator(`a[href="/analyses/${analysisId}"]`); await expect(old).toContainText('Durée :');
      await expect(old).toContainText('Terminée'); await old.click(); await expect(page.locator('tbody tr')).toHaveCount(2);
    });
    await test.step('8. Telecharger le vrai rapport JSON complet', async () => {
      const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exporter le rapport JSON' }).click();
      const file = await pending; expect(file.suggestedFilename()).toBe(`codeaudit-analysis-${analysisId}.json`);
      const exported = JSON.parse(await readFile((await file.path())!, 'utf8')) as { analysis: { id: string; status: string }; report: { issues: unknown[] } };
      expect(exported.analysis).toMatchObject({ id: analysisId, status: 'SUCCEEDED' }); expect(exported.report.issues).toHaveLength(2);
      expect(exported).toEqual(await (await request.get(`${apiUrl}/api/analyses/${analysisId}/report`)).json());
      expect(exported.report).toEqual(await (await request.get(`${apiUrl}/api/analyses/${analysisId}/results`)).json());
    });
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) { const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) }); worker.kill('SIGTERM'); await exited; }
    if (projectId) { const response = await request.delete(`${apiUrl}/api/projects/${projectId}`); expect(response.status()).toBe(204); }
  }
});

test('refuse un ZIP traversant depuis le formulaire sans creer d’analyse', async ({ page, request }) => {
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Rejected ZIP ${randomUUID()}` } }); expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };
  try {
    await page.goto(`/projects/${id}`);
    await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'unsafe.zip', mimeType: 'application/zip', buffer: zip([{ name: '../escape.js', data: 'debugger;' }]) });
    await page.getByRole('button', { name: 'Lancer l’analyse' }).click();
    await expect(page.getByRole('alert')).toContainText(/chemin|ZIP/);
    expect((await (await request.get(`${apiUrl}/api/projects/${id}/analyses`)).json() as { items: unknown[] }).items).toEqual([]);
  } finally { expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204); }
});
