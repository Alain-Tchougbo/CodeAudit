import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthProfile } from '@codeaudit/contracts';
import { authState, acceptProfile, clearSession } from '../src/auth-state';
import { authenticate, logout, safeRedirect } from '../src/auth';
import { apiJson } from '../src/api/http';
import { router } from '../src/router';
import AuthView from '../src/views/AuthView.vue';
const profile: AuthProfile = { user: { id: 'user-a', name: 'Alice', email: 'alice@example.test', createdAt: '2026-10-31T00:00:00Z' }, csrfToken: 'c'.repeat(64), expiresAt: '2026-10-31T08:00:00Z' };
const wrappers: VueWrapper[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(async () => { clearSession(); authState.error.value = ''; localStorage.clear(); sessionStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(json({ code: 'AUTH_REQUIRED', message: 'Connectez-vous.' }, 401)))); await router.push('/login'); });
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); clearSession(); vi.unstubAllGlobals(); });
describe('Authentification Vue', () => {
  it('protege une URL directe et conserve une destination interne', async () => {
    authState.ready.value = false; await router.push('/projects/private');
    expect(router.currentRoute.value.name).toBe('login'); expect(router.currentRoute.value.query.redirect).toBe('/projects/private');
    expect(fetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'same-origin' }));
  });
  it('restaure le profil avec le cookie sans utiliser localStorage ni sessionStorage', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(profile)); authState.ready.value = false;
    await router.push('/projects'); expect(authState.user.value).toEqual(profile.user);
    await router.push('/profile'); expect(fetch).toHaveBeenCalledTimes(1); expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  });
  it('affiche le formulaire de connexion et ouvre la destination apres succes', async () => {
    await router.push('/login?redirect=/projects'); vi.mocked(fetch).mockResolvedValueOnce(json(profile));
    const wrapper = mount(AuthView, { global: { plugins: [router] } }); wrappers.push(wrapper);
    await wrapper.get('#auth-email').setValue('alice@example.test'); await wrapper.get('#auth-password').setValue('A long passphrase 2026!');
    await wrapper.get('form').trigger('submit'); await flushPromises(); expect(router.currentRoute.value.path).toBe('/projects'); expect(authState.user.value?.name).toBe('Alice');
    const [path, options] = vi.mocked(fetch).mock.calls[0]!; expect(path).toBe('/api/auth/login'); expect(new Headers(options!.headers).get('X-CodeAudit-Request')).toBe('1');
  });
  it('affiche inscription, erreurs serveur et bloque le double envoi', async () => {
    await router.push('/register'); let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const wrapper = mount(AuthView, { global: { plugins: [router] } }); wrappers.push(wrapper);
    await wrapper.get('#auth-name').setValue('Alice'); await wrapper.get('#auth-email').setValue('alice@example.test'); await wrapper.get('#auth-password').setValue('A long passphrase 2026!');
    await wrapper.get('form').trigger('submit'); await wrapper.get('form').trigger('submit'); expect(fetch).toHaveBeenCalledTimes(1); expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
    resolve(json({ code: 'EMAIL_ALREADY_USED', message: 'Cette adresse e-mail est déjà utilisée.' }, 409)); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('déjà utilisée'); expect(authState.user.value).toBeNull();
    await router.push('/login'); expect(wrapper.get('#auth-password').element).toHaveProperty('value', '');
  });
  it('transmet CSRF sur les mutations et garde le cookie hors du code JavaScript', async () => {
    acceptProfile(profile); vi.mocked(fetch).mockResolvedValueOnce(json({}));
    await apiJson('/projects', { method: 'POST', body: '{}' });
    const options = vi.mocked(fetch).mock.calls[0]![1]!; const headers = new Headers(options.headers);
    expect(headers.get('X-CSRF-Token')).toBe(profile.csrfToken); expect(headers.has('Cookie')).toBe(false); expect(options.credentials).toBe('same-origin');
  });
  it('efface le profil et redirige quand une requete recoit une session expiree', async () => {
    acceptProfile(profile); await router.push('/projects');
    vi.mocked(fetch).mockResolvedValueOnce(json({ code: 'SESSION_EXPIRED', message: 'Session expirée.' }, 401));
    await expect(apiJson('/projects')).rejects.toMatchObject({ status: 401 }); await flushPromises();
    expect(authState.user.value).toBeNull(); expect(authState.csrf.value).toBe(''); expect(router.currentRoute.value.name).toBe('login'); expect(router.currentRoute.value.query.reason).toBe('expired');
  });
  it('efface l’authentification apres deconnexion confirmee par le serveur', async () => {
    acceptProfile(profile); vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 })); await logout();
    expect(authState.user.value).toBeNull(); expect(authState.csrf.value).toBe('');
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
  it('ignore un ancien 401 apres ouverture d’une nouvelle session', async () => {
    acceptProfile(profile); let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const previous = apiJson('/projects'); acceptProfile({ ...profile, user: { ...profile.user, id: 'user-b' } });
    resolve(json({ code: 'SESSION_EXPIRED' }, 401)); await expect(previous).rejects.toMatchObject({ status: 401 }); expect(authState.user.value?.id).toBe('user-b');
  });
  it('ne pretend pas deconnecter si le serveur est injoignable', async () => {
    acceptProfile(profile); vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    await expect(logout()).rejects.toThrow('Impossible de joindre'); expect(authState.user.value).toEqual(profile.user);
  });
  it('affiche les champs invalides ou identifiants incorrects sans enregistrer le mot de passe', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ code: 'INVALID_CREDENTIALS', message: 'Adresse e-mail ou mot de passe incorrect.' }, 401));
    await expect(authenticate('login', { email: 'alice@example.test', password: 'A long passphrase 2026!' })).rejects.toThrow('incorrect'); expect(localStorage.length).toBe(0);
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/register?x=1', ['array']])('refuse une redirection non sure (%s)', (value) => { expect(safeRedirect(value)).toBe('/'); });
});
