import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import AccountRecoveryView from '../src/views/AccountRecoveryView.vue';
import ActiveSessions from '../src/components/ActiveSessions.vue';
import { authState, clearSession } from '../src/auth-state';
const wrappers: VueWrapper[] = [];
const token = 'a'.repeat(64); const password = 'A replacement passphrase 2026!';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
async function screen(path: string, sessions = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/forgot-password', name: 'forgot-password', component: AccountRecoveryView }, { path: '/reset-password', name: 'reset-password', component: AccountRecoveryView }, { path: '/login', component: { template: '<p>Connexion</p>' } },
  ] }); await router.push(path); await router.isReady();
  const wrapper = mount(sessions ? ActiveSessions : { template: '<RouterView />' }, { global: { plugins: [router] } }); wrappers.push(wrapper); return { wrapper, router };
}
beforeEach(() => { clearSession(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 }))); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); });
describe('Récupération de compte', () => {
  it('envoie l’adresse et annonce seulement une réponse générique', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ message: 'Generic' }, 202)); const { wrapper } = await screen('/forgot-password');
    await wrapper.get('#recovery-email').setValue('alice@example.test'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('Si un compte correspond'); expect(fetch).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'alice@example.test' }) }));
  });
  it('valide la confirmation puis efface mot de passe et fragment après réussite', async () => {
    const { wrapper, router } = await screen(`/reset-password#token=${token}`);
    await wrapper.get('#recovery-password').setValue(password); await wrapper.get('#recovery-confirmation').setValue('Different passphrase'); await wrapper.get('form').trigger('submit'); expect(fetch).not.toHaveBeenCalled();
    await wrapper.get('#recovery-confirmation').setValue(password); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain('a été modifié'); expect(router.currentRoute.value.hash).toBe(''); expect(wrapper.find('input[type="password"]').exists()).toBe(false); expect(authState.user.value).toBeNull(); expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it('explique un lien absent ou refusé et permet d’en demander un autre', async () => {
    const { wrapper, router } = await screen('/reset-password'); expect(wrapper.get('[role="alert"]').text()).toContain('Ouvrez le lien');
    await router.push(`/reset-password#token=${token}`); vi.mocked(fetch).mockResolvedValueOnce(json({ message: 'Lien expiré.', code: 'RESET_TOKEN_INVALID' }, 400));
    await wrapper.get('#recovery-password').setValue(password); await wrapper.get('#recovery-confirmation').setValue(password); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('Lien expiré');
    expect(wrapper.find('a[href="/forgot-password"]').exists()).toBe(true);
  });
  it('réinitialise l’état de succès lors du passage du formulaire e-mail au formulaire de mot de passe', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}, 202)); const { wrapper, router } = await screen('/forgot-password');
    await wrapper.get('#recovery-email').setValue('alice@example.test'); await wrapper.get('form').trigger('submit'); await flushPromises();
    await router.push(`/reset-password#token=${token}`); await flushPromises(); expect(wrapper.find('[role="status"]').exists()).toBe(false); expect(wrapper.find('#recovery-password').exists()).toBe(true);
  });
  it('ignore la réponse d’un formulaire quitté avant sa fin', async () => {
    let resolve!: (value: Response) => void; vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const { wrapper, router } = await screen('/forgot-password'); await wrapper.get('#recovery-email').setValue('alice@example.test'); await wrapper.get('form').trigger('submit');
    await router.push(`/reset-password#token=${token}`); resolve(json({}, 202)); await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false); expect(wrapper.find('#recovery-password').exists()).toBe(true);
  });
});
describe('Sessions actives', () => {
  it('requiert confirmation avant révocation d’une autre session et actualise les données', async () => {
    const session = { id: 'session-id', current: false, createdAt: '2026-10-31T08:00:00Z', lastSeenAt: '2026-10-31T08:05:00Z', expiresAt: '2026-10-31T16:00:00Z' };
    vi.mocked(fetch).mockResolvedValueOnce(json([session])).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json([]));
    const { wrapper } = await screen('/login', true); await flushPromises(); await wrapper.get('[aria-label="Révoquer la session session-"]').trigger('click'); expect(fetch).toHaveBeenCalledTimes(1);
    await wrapper.findAll('button').find(button => button.text() === 'Confirmer la révocation')!.trigger('click'); await flushPromises(); expect(fetch).toHaveBeenCalledWith('/api/auth/sessions/session-id', expect.objectContaining({ method: 'DELETE' })); expect(wrapper.text()).toContain('Session révoquée.');
  });
  it('ne prétend pas fermer les sessions si le serveur est injoignable', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json([])).mockRejectedValueOnce(new TypeError('offline')); const { wrapper, router } = await screen('/login', true); await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Fermer toutes les sessions')!.trigger('click'); await wrapper.findAll('button').find(button => button.text() === 'Confirmer la révocation')!.trigger('click'); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('Impossible de joindre'); expect(router.currentRoute.value.fullPath).toBe('/login');
  });
});
