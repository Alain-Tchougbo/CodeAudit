import { OAuthService } from '../src/auth/oauth.service';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { MfaService } from '../src/auth/mfa.service';
import { SecurityCrypto } from '../src/auth/security-crypto';
import { SecurityAuditService } from '../src/auth/security-audit.service';
const originalOrigin = process.env.AUTH_APP_ORIGIN;
const service = () => new OAuthService({} as PrismaService, {} as AuthService, {} as MfaService, new SecurityCrypto(), {} as SecurityAuditService);
afterEach(() => { jest.restoreAllMocks(); if (originalOrigin === undefined) delete process.env.AUTH_APP_ORIGIN; else process.env.AUTH_APP_ORIGIN = originalOrigin; });
describe('Transport OAuth fixe et borné', () => {
  it.each(['GITHUB', 'GITLAB'] as const)('échange le code avec PKCE puis lit uniquement l’identité %s', async provider => {
    process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173'; const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'controlled-access-token', token_type: 'Bearer' }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: 'octocat', username: 'gitlab-user', email: 'not-used@example.test' })));
    expect(await service().identity(provider, 'controlled-code', 'controlled-verifier')).toEqual({ subject: '123', login: provider === 'GITHUB' ? 'octocat' : 'gitlab-user' }); const first = fetch.mock.calls[0]!; expect(first[0]).toBe(provider === 'GITHUB' ? 'https://github.com/login/oauth/access_token' : 'https://gitlab.com/oauth/token'); expect(first[1]).toMatchObject({ redirect: 'error', method: 'POST' }); expect(new URLSearchParams(first[1]!.body as string).get('code_verifier')).toBe('controlled-verifier'); expect(fetch.mock.calls[1]![0]).toBe(provider === 'GITHUB' ? 'https://api.github.com/user' : 'https://gitlab.com/api/v4/user');
  });
  it('refuse les réponses trop volumineuses sans enregistrer leurs secrets', async () => {
    process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173'; jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('x'.repeat(512 * 1024 + 1))); await expect(service().identity('GITHUB', 'code', 'verifier')).rejects.toThrow('fournisseur');
  });
  it('refuse une réponse invalide ou un échec réseau', async () => {
    process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173'; const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'controlled', token_type: 'unsupported' }))); await expect(service().identity('GITHUB', 'code', 'verifier')).rejects.toThrow(); fetch.mockRejectedValueOnce(new Error('controlled failure')); await expect(service().identity('GITLAB', 'code', 'verifier')).rejects.toThrow('fournisseur');
  });
});
