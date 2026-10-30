import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysesApi } from '../src/api/analyses';
afterEach(() => vi.unstubAllGlobals());
describe('Client HTTP analyses', () => {
  it('utilise les endpoints réels et transmet les signaux et curseurs', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}'))); vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await analysesApi.dashboard(signal); await analysesApi.get('a/b', signal); await analysesApi.results('a/b', signal); await analysesApi.history('p/q', 'a+b', signal);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/api/dashboard', '/api/analyses/a%2Fb', '/api/analyses/a%2Fb/results', '/api/projects/p%2Fq/analyses?limit=20&cursor=a%2Bb']);
    expect(fetch).toHaveBeenLastCalledWith(expect.any(String), { signal });
  });
  it('propage une erreur serveur structurée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"Analyse introuvable."}', { status: 404 })));
    await expect(analysesApi.get('missing')).rejects.toThrow('Analyse introuvable.');
  });
  it('explique une panne réseau et les réponses non JSON en erreur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(new Response('unavailable', { status: 503 })));
    await expect(analysesApi.dashboard()).rejects.toThrow('Impossible de joindre');
    await expect(analysesApi.dashboard()).rejects.toThrow('La requête a échoué');
  });
  it('préserve les annulations', async () => {
    const stop = new AbortController(); stop.abort(); const cause = new DOMException('cancel', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause)); await expect(analysesApi.get('id', stop.signal)).rejects.toBe(cause);
  });
});
