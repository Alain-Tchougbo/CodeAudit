import { randomUUID } from 'node:crypto';
import { expect, test } from './authenticated';
const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;
test('présente les modes Git et refuse une URL arbitraire avant téléchargement', async ({ page, request }) => {
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name: `Git ${randomUUID().slice(0, 8)}` } }); expect(created.status()).toBe(201); const { id } = await created.json() as { id: string };
  let imports = 0; page.on('request', outgoing => { if (outgoing.method() === 'POST' && outgoing.url().endsWith('/analyses/github')) imports++; });
  try {
    await page.setViewportSize({ width: 390, height: 900 }); await page.goto(`/projects/${id}`); await page.getByText('Analyser depuis GitHub', { exact: true }).click();
    await page.getByLabel('Dépôt GitHub public').fill('https://127.0.0.1/internal'); await expect(page.getByLabel('Conserver un aperçu du code pour les diagnostics Git')).not.toBeChecked();
    await page.getByLabel('Pull request', { exact: true }).check(); await page.getByLabel('Numéro de pull request').fill('12');
    await page.getByRole('button', { name: 'Importer et analyser depuis GitHub' }).click(); await expect(page.getByRole('alert')).toContainText('propriétaire/dépôt'); expect(imports).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { expect((await request.delete(`${apiUrl}/api/projects/${id}`)).status()).toBe(204); }
});
