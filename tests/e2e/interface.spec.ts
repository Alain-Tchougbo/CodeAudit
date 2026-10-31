import { randomUUID } from 'node:crypto';
import { expect, test } from './authenticated';

const apiUrl = `http://127.0.0.1:${process.env.E2E_API_PORT ?? '3100'}`;

test('navigation responsive, recherche réelle, confirmation au clavier et vues du compte', async ({ page, request }, testInfo) => {
  const name = `Interface ${randomUUID().slice(0, 8)}`;
  const created = await request.post(`${apiUrl}/api/projects`, { data: { name, description: 'Sources du portail de facturation.' } });
  expect(created.status()).toBe(201);
  const { id } = await created.json() as { id: string };
  expect((await request.post(`${apiUrl}/api/projects`, { data: { name: 'Autre projet', description: 'Une bibliothèque indépendante.' } })).status()).toBe(201);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  const capture = async (label: string) => {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true, animations: 'disabled' }), contentType: 'image/png' });
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tableau de bord', exact: true })).toBeVisible();
  await expect(page.locator('.metrics-strip').first()).toContainText('2');
  for (const element of [page.getByRole('link', { name: 'Nouveau projet', exact: true }), page.locator('.nav-item.is-active').first()]) {
    const contrast = await element.evaluate((node) => {
      const style = getComputedStyle(node);
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
      };
      const text = luminance(style.color); const background = luminance(style.backgroundColor);
      return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await capture('dashboard-desktop');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Projets', exact: true }).click();
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveTitle('Projets · CodeAudit');
  await page.getByRole('searchbox', { name: 'Rechercher un projet' }).fill(' FACTURATION ');
  await expect(page.locator('main li')).toHaveCount(1);
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher un projet' }).fill('introuvable');
  await expect(page.getByRole('heading', { name: 'Aucun projet ne correspond' })).toBeVisible();
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  await expect(page.locator('main li')).toHaveCount(2);
  await capture('projects-desktop');
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer le projet', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Supprimer le projet', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Confirmation de suppression' })).toHaveCount(0);
  await capture('project-desktop');
  await page.getByRole('link', { name: 'Modifier le projet' }).click();
  await expect(page.getByLabel('Nom du projet')).toHaveValue(name);
  await capture('project-edit-desktop');
  await page.getByRole('link', { name: 'Mon profil', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mon profil', exact: true })).toBeVisible();
  await capture('profile-desktop');
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/projects', `/projects/${id}`, `/projects/${id}/edit`, '/projects/new', '/profile']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main [role="alert"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: 'Supprimer le projet', exact: true }).evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await capture('project-mobile-reduced-motion');
  expect(errors).toEqual([]);
});
