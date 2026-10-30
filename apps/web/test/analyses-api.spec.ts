import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysesApi } from '../src/api/analyses';
afterEach(() => vi.unstubAllGlobals());
describe('Client HTTP analyses', () => {
  it('envoie une archive multipart sans imposer un Content-Type JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"queued"}', { status: 202 })); vi.stubGlobal('fetch', fetch);
    const file = new File(['ZIP'], 'project.zip', { type: 'application/zip' });
    expect(await analysesApi.create('p/q', file)).toEqual({ id: 'queued' });
    const [path, options] = fetch.mock.calls[0]!; expect(path).toBe('/api/projects/p%2Fq/analyses');
    expect(options.method).toBe('POST'); expect(options.body.get('archive')).toEqual(file); expect(options.headers).toBeUndefined();
  });
  it('recupere le fichier JSON brut depuis le veritable endpoint export', async () => {
    const content = '{ "schemaVersion": 1, "report": { "issues": [] } }';
    const fetch = vi.fn().mockResolvedValue(new Response(content, { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch); const signal = new AbortController().signal;
    const blob = await analysesApi.export('a/b', signal);
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toBe(content);
    expect(fetch).toHaveBeenCalledWith('/api/analyses/a%2Fb/report', { signal });
  });
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
