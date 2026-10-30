import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';

const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
const createdIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const id of createdIds) await request.delete(`${apiUrl}/api/projects/${id}`);
  createdIds.clear();
});

test('crée, retrouve, modifie et supprime un projet via les véritables endpoints', async ({ page, request }) => {
  const name = `Projet E2E ${randomUUID()}`;
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projets', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ajouter un projet' }).click();
  await page.getByLabel('Nom du projet').fill(name);
  await page.getByLabel('Description (facultative)').fill('Description persistée');
  const createdResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/projects') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer le projet' }).click();
  const created = await (await createdResponse).json() as { id: string };
  createdIds.add(created.id);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Projet créé.' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Description persistée', { exact: true })).toBeVisible();

  const persisted = await request.get(`${apiUrl}/api/projects/${created.id}`);
  expect(persisted.status()).toBe(200);
  expect(await persisted.json()).toMatchObject({ name, description: 'Description persistée' });

  await page.getByRole('link', { name: 'Modifier le projet' }).click();
  await expect(page.getByLabel('Nom du projet')).toHaveValue(name);
  await page.getByLabel('Nom du projet').fill(name + ' modifié');
  await page.getByLabel('Description (facultative)').fill('');
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
  await expect(page.getByRole('heading', { name: name + ' modifié', exact: true })).toBeVisible();
  await expect(page.getByText('Aucune description.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Retour aux projets' }).click();
  await page.getByRole('link', { name: name + ' modifié', exact: true }).click();
  await page.getByRole('button', { name: 'Supprimer le projet', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Projet supprimé.' })).toBeVisible();
  await expect(page.getByRole('link', { name: name + ' modifié', exact: true })).toHaveCount(0);
  expect((await request.get(`${apiUrl}/api/projects/${created.id}`)).status()).toBe(404);
});

test('explique une ressource absente depuis une URL directe', async ({ page }) => {
  await page.goto(`/projects/${randomUUID()}`);
  await expect(page.getByRole('alert')).toContainText('Projet introuvable.');
  await expect(page.getByRole('link', { name: 'Retour aux projets' })).toBeVisible();
});

test('consulte un véritable rapport depuis le tableau de bord, filtre et pagine sur mobile', async ({ page, request }) => {
  const name = `Audit E2E ${randomUUID()}`;
  const project = await request.post(`${apiUrl}/api/projects`, { data: { name } });
  expect(project.status()).toBe(201);
  const { id: projectId } = await project.json() as { id: string }; createdIds.add(projectId);
  const archive = zip([{ name: 'src/index.js', data: Array.from({ length: 25 }, (_, index) => `missing${index};`).join('\n') + '\nconsole.log("warning");' }]);
  const queued = await request.post(`${apiUrl}/api/projects/${projectId}/analyses`, { multipart: { archive: { name: 'project.zip', mimeType: 'application/zip', buffer: archive } } });
  expect(queued.status()).toBe(202);
  const { id } = await queued.json() as { id: string };
  const worker = spawn(process.execPath, [resolve('apps/worker/dist/index.js')], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: 'ignore', windowsHide: true });
  try {
    await expect.poll(async () => (await (await request.get(`${apiUrl}/api/analyses/${id}`)).json() as { status: string }).status, { timeout: 20000 }).toBe('SUCCEEDED');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name: 'Détail de l’analyse' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await page.getByLabel('Gravité', { exact: true }).selectOption('warning');
    await page.getByLabel('Règle ESLint', { exact: true }).selectOption('no-console');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody')).toContainText('src/index.js');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter le rapport JSON' }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(`codeaudit-analysis-${id}.json`);
    const exported = JSON.parse(await readFile((await file.path())!, 'utf8')) as {
      project: { name: string }; report: { issues: { severity: string; message: string }[]; statistics: { errorCount: number; warningCount: number } };
    };
    expect(exported).toEqual(await (await request.get(`${apiUrl}/api/analyses/${id}/report`)).json());
    expect(exported.project.name).toBe(name); expect(exported.report.issues).toHaveLength(26);
    await expect(page.locator('tbody')).toContainText(exported.report.issues.find((item) => item.severity === 'warning')!.message);
    await expect(page.locator('dt').filter({ hasText: /^Erreurs$/ }).locator('..').locator('dd')).toHaveText(String(exported.report.statistics.errorCount));
    await expect(page.locator('dt').filter({ hasText: /^Avertissements$/ }).locator('..').locator('dd')).toHaveText(String(exported.report.statistics.warningCount));
    await page.getByLabel('Nom de fichier').fill('absent.ts');
    await expect(page.getByText('Aucun problème ne correspond aux filtres.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
    await page.getByRole('button', { name: 'Suivant', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(6);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: '.tmp/analysis-results-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Voir le projet et son historique' }).click();
    await expect(page.getByRole('heading', { name: 'Historique des analyses' })).toBeVisible();
    await expect(page.locator(`a[href="/analyses/${id}"]`)).toBeVisible();
    const next = await request.post(`${apiUrl}/api/projects/${projectId}/analyses`, { multipart: { archive: { name: 'clean.zip', mimeType: 'application/zip', buffer: zip([{ name: 'clean.js', data: 'export const value = 1;' }]) } } });
    expect(next.status()).toBe(202); const nextId = (await next.json() as { id: string }).id;
    await expect.poll(async () => (await (await request.get(`${apiUrl}/api/analyses/${nextId}`)).json() as { status: string }).status, { timeout: 20000 }).toBe('SUCCEEDED');
    await page.getByRole('button', { name: 'Actualiser l’historique' }).click();
    await expect(page.locator(`a[href="/analyses/${nextId}"]`)).toBeVisible();
    await page.locator(`a[href="/analyses/${id}"]`).click();
    await expect(page.locator('dt').filter({ hasText: /^Erreurs$/ }).locator('..').locator('dd')).toHaveText('25');
    expect(await (await request.get(`${apiUrl}/api/analyses/${id}/report`)).json()).toEqual(exported);
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit', { signal: AbortSignal.timeout(5000) });
      worker.kill('SIGTERM'); await exited;
    }
  }
});
