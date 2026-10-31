import { randomUUID } from 'node:crypto';
import { expect, test } from './authenticated';
import { zip } from '../../packages/analysis-jobs/test/zip-builder';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('annule depuis Vue une analyse en attente et la retrouve sans rapport dans l’historique', async ({ page, request }) => {
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Cancellation ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201); const { id } = await created.json() as { id: string };
  try {
    await page.goto(`/projects/${id}`); await page.getByLabel('Archive ZIP du projet').setInputFiles({ name: 'sources.zip', mimeType: 'application/zip', buffer: zip([{ name: 'index.js', data: 'export const answer = 42;' }]) });
    await page.getByRole('button', { name: 'Lancer l’analyse', exact: true }).click(); await expect(page.getByText('En attente', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Annuler l’analyse', exact: true }).click(); await expect(page.getByRole('button', { name: 'Poursuivre l’analyse' })).toBeFocused();
    await page.getByRole('button', { name: 'Poursuivre l’analyse' }).press('Escape'); await expect(page.getByRole('button', { name: 'Confirmer l’annulation' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Annuler l’analyse', exact: true }).click(); await page.getByRole('button', { name: 'Confirmer l’annulation', exact: true }).click();
    await expect(page.getByText('Annulée', { exact: true })).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: 'Analyse annulée' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter le rapport JSON', exact: true })).toBeDisabled(); await expect(page.locator('table')).toHaveCount(0);
    await page.reload(); await expect(page.getByText('Annulée', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Voir le projet et son historique' }).click(); await expect(page.locator('tbody')).toContainText('Annulée');
  } finally { expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204); }
});
