import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
const createdIds = new Set<string>();

test.afterEach(async ({ request }) => {
  for (const id of createdIds) await request.delete(`${apiUrl}/api/projects/${id}`);
  createdIds.clear();
});

test('crée, retrouve, modifie et supprime un projet via les véritables endpoints', async ({ page, request }) => {
  const name = `Projet E2E ${randomUUID()}`;
  await page.goto('/');
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
  await expect(page.getByRole('status')).toHaveText('Projet créé.');
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
