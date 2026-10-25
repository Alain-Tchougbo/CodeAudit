import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectApiError, projectsApi } from '../src/api/projects';

afterEach(() => vi.unstubAllGlobals());

describe('Client HTTP projets', () => {
  it('utilise le véritable chemin de création et un corps JSON', async () => {
    const project = { id: 'created', name: 'Nom' };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(project), { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    expect(await projectsApi.create({ name: 'Nom' })).toEqual(project);
    expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ name: 'Nom' }), headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('ne tente pas de lire du JSON après une suppression 204', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(projectsApi.delete('id')).resolves.toBeUndefined();
  });

  it('conserve le code et les détails utiles des erreurs API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'VALIDATION_ERROR', message: 'Données invalides.', details: ['Nom trop long.'],
    }), { status: 400 })));
    await expect(projectsApi.create({ name: 'Nom' })).rejects.toMatchObject({
      status: 400, code: 'VALIDATION_ERROR', message: 'Nom trop long.',
    });
  });

  it('gère une panne réseau sans masquer les erreurs par des données fictives', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(projectsApi.list()).rejects.toBeInstanceOf(ProjectApiError);
  });

  it('gère une erreur HTTP qui ne contient pas de JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
    await expect(projectsApi.list()).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });
});
