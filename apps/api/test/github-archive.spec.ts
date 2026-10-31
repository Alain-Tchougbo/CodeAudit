import { GitHubArchiveService } from '../src/analyses/github-archive.service';
import { IMPORT_LIMITS } from '@codeaudit/analysis-jobs';
import { gitSource } from '../src/analyses/git-source';
const sha = 'a'.repeat(40); const location = `https://codeload.github.com/example/source/legacy.zip/${sha}`;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
describe('Téléchargement GitHub borné', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const service = new GitHubArchiveService();
  beforeEach(() => { fetchMock = jest.spyOn(globalThis, 'fetch'); }); afterEach(() => { jest.restoreAllMocks(); });
  function prefix(target = location) {
    fetchMock.mockResolvedValueOnce(json({ private: false, default_branch: 'main' })).mockResolvedValueOnce(json({ sha }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: target } }));
  }
  it('résout une branche puis télécharge le commit sans authentification externe', async () => {
    prefix(); fetchMock.mockResolvedValueOnce(new Response(Uint8Array.from([80, 75, 3, 4])));
    const result = await service.download({ repository: 'example/source', ref: 'feature/test' });
    expect(result.source).toMatchObject({ repository: 'example/source', archiveRepository: 'example/source', requestedRef: 'feature/test', commitSha: sha, pullRequest: null });
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.github.com/repos/example/source/commits/feature%2Ftest');
    expect(fetchMock.mock.calls[2]![0]).toBe(`https://api.github.com/repos/example/source/zipball/${sha}`);
    expect(fetchMock.mock.calls.every(call => call[1]?.redirect === 'manual' && !JSON.stringify(call[1]?.headers).includes('Authorization'))).toBe(true);
  });
  it('résout la tête d’une pull request publique depuis son fork', async () => {
    fetchMock.mockResolvedValueOnce(json({ private: false })).mockResolvedValueOnce(json({ head: { sha, repo: { private: false, full_name: 'contributor/fork' } } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } })).mockResolvedValueOnce(new Response('zip'));
    const result = await service.download({ repository: 'example/source', pullRequest: 12 });
    expect(result.source).toMatchObject({ repository: 'example/source', archiveRepository: 'contributor/fork', requestedRef: 'pull/12', pullRequest: 12, commitSha: sha });
    expect(fetchMock.mock.calls[2]![0]).toBe(`https://api.github.com/repos/contributor/fork/zipball/${sha}`);
  });
  it.each(['http://codeload.github.com/archive', 'https://evil.example/archive', 'https://codeload.github.com@127.0.0.1/archive', 'https://codeload.github.com:444/archive'])('refuse la redirection %s sans la suivre', async target => {
    prefix(target); await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 502 }); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('refuse aussi une seconde redirection depuis codeload', async () => {
    prefix(); fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }));
    await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 502 }); expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it.each([true, false])('borne les octets avec ou sans Content-Length (%s)', async advertised => {
    prefix(); fetchMock.mockResolvedValueOnce(new Response(advertised ? 'tiny' : new Uint8Array(IMPORT_LIMITS.archiveBytes + 1), { headers: advertised ? { 'content-length': String(IMPORT_LIMITS.archiveBytes + 1) } : {} }));
    await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 413 });
  });
  it.each([[404, 422], [429, 429], [500, 502]])('normalise HTTP %s sans exposer le corps fournisseur', async (status, expected) => {
    fetchMock.mockResolvedValueOnce(new Response('Untrusted provider details', { status }));
    await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: expected });
  });
  it('refuse un dépôt privé et une réponse malformée sans créer de configuration alternative', async () => {
    fetchMock.mockResolvedValueOnce(json({ private: true })); await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 422 });
    fetchMock.mockResolvedValueOnce(new Response('not-json')); await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 502 });
  });
  it('borne aussi les métadonnées JSON et exige un SHA de commit', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(1024 * 1024 + 1))); await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 413 });
    fetchMock.mockResolvedValueOnce(json({ private: false, default_branch: 'main' })).mockResolvedValueOnce(json({ sha: '../main' }));
    await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 502 });
  });
  it('normalise une interruption réseau sans propager son message', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('sensitive transport details'), { name: 'TimeoutError' }));
    await expect(service.download({ repository: 'example/source' })).rejects.toMatchObject({ status: 504 });
  });
  it('valide la provenance enregistrée et expose seulement ses champs publics', () => {
    const source = { schemaVersion: 1, provider: 'GITHUB', repository: 'example/source', archiveRepository: 'example/source', requestedRef: 'main', commitSha: sha, pullRequest: null };
    expect(() => gitSource({ ...source, unexpectedSecret: 'hidden' })).toThrow(); expect(gitSource(source)).toEqual(source); expect(gitSource(null)).toBeNull();
    expect(() => gitSource({ ...source, commitSha: '../source' })).toThrow();
  });
});
