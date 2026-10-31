import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSecurityState, AuthProfile } from '@codeaudit/contracts';
import { acceptProfile, authState, clearSession } from '../src/auth-state';
import { router } from '../src/router';
import ProfileEditor from '../src/components/ProfileEditor.vue';
import PasswordSettings from '../src/components/PasswordSettings.vue';
import EmailSecurity from '../src/components/EmailSecurity.vue';
import AccountSecurity from '../src/components/AccountSecurity.vue';
import PersonalDataControls from '../src/components/PersonalDataControls.vue';
import OAuthLogin from '../src/components/OAuthLogin.vue';
import VerifyEmailView from '../src/views/VerifyEmailView.vue';
import AuthView from '../src/views/AuthView.vue';
import { ApiRequestError } from '../src/api/http';
const api = vi.hoisted(() => vi.fn());
vi.mock('../src/api/http', async original => ({ ...await original<typeof import('../src/api/http')>(), apiJson: api }));
const profile: AuthProfile = { user: { id: 'owner', name: 'Alice', email: 'alice@example.test', createdAt: '2026-10-31T08:00:00Z' }, csrfToken: 'c'.repeat(64), expiresAt: '2026-11-01T08:00:00Z' };
const state: AccountSecurityState = { emailVerifiedAt: '2026-10-31T08:00:00Z', mfa: { enabled: false, available: true, recoveryCodesRemaining: 0 }, identities: [], providers: [{ provider: 'GITHUB', configured: false }, { provider: 'GITLAB', configured: false }] };
beforeEach(() => { api.mockReset(); clearSession(); acceptProfile(profile); }); afterEach(() => { vi.restoreAllMocks(); });
describe('Module comptes et sécurité Vue', () => {
  it('modifie le profil à travers le contrat réel et actualise la session en mémoire', async () => {
    const wrapper = mount(ProfileEditor); await wrapper.get('#profile-name').setValue('Alice Updated'); api.mockResolvedValueOnce({ ...profile, user: { ...profile.user, name: 'Alice Updated' } }); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api).toHaveBeenCalledWith('/auth/profile', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Alice Updated' }) })); expect(authState.user.value?.name).toBe('Alice Updated'); expect(wrapper.get('[role="status"]').text()).toContain('mis à jour'); wrapper.unmount();
  });
  it('refuse les confirmations de mot de passe différentes sans appel API', async () => {
    const wrapper = mount(PasswordSettings, { props: { mfa: false }, global: { plugins: [router] } }); await wrapper.get('#new-password').setValue('One new passphrase!'); await wrapper.get('#confirm-new-password').setValue('Another new passphrase!'); await wrapper.get('form').trigger('submit'); expect(api).not.toHaveBeenCalled(); expect(wrapper.get('[role="alert"]').text()).toContain('ne correspondent pas'); wrapper.unmount();
  });
  it('ne présente pas l’adresse comme vérifiée avant confirmation du lien', async () => {
    const wrapper = mount(EmailSecurity, { props: { verifiedAt: null, mfa: false } }); api.mockResolvedValueOnce({ message: 'Lien envoyé.' }); await wrapper.get('button').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('pas encore vérifiée'); expect(wrapper.get('[role="status"]').text()).toBe('Lien envoyé.'); wrapper.unmount();
  });
  it('conserve l’état non vérifié quand SMTP échoue', async () => {
    api.mockRejectedValueOnce(new Error('Message non envoyé.')); const wrapper = mount(EmailSecurity, { props: { verifiedAt: null, mfa: false } }); await wrapper.get('button').trigger('click'); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('non envoyé'); expect(wrapper.find('[role="status"]').exists()).toBe(false); wrapper.unmount();
  });
  it('garde les codes de secours après actualisation du statut 2FA et ne les persiste pas', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'); const codes = ['12345678-12345678-12345678-12345678', 'abcdef12-abcdef12-abcdef12-abcdef12'];
    api.mockImplementation((path: string) => path === '/auth/security' ? Promise.resolve(state) : Promise.resolve({ items: [], nextCursor: null })); const wrapper = mount(AccountSecurity, { global: { plugins: [router] } }); await flushPromises();
    await wrapper.get('#mfa-setup-password').setValue('A long passphrase 2026!'); api.mockResolvedValueOnce({ secret: 'SYNTHETICKEY', uri: 'otpauth://totp/CodeAudit?secret=SYNTHETICKEY', expiresInSeconds: 600 }); const setupForm = wrapper.get('#mfa-setup-password').element.closest('form')!; await wrapper.findAll('form').find(form => form.element === setupForm)!.trigger('submit'); await flushPromises();
    await wrapper.get('#totp-confirm').setValue('123456'); api.mockResolvedValueOnce({ profile, recoveryCodes: codes }); const confirmForm = wrapper.get('#totp-confirm').element.closest('form')!; await wrapper.findAll('form').find(form => form.element === confirmForm)!.trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain(codes[0]); expect(wrapper.text()).toContain('Active · 2 codes de secours disponibles'); expect(storage).not.toHaveBeenCalled(); await wrapper.findAll('button').find(button => button.text().includes('les masquer'))!.trigger('click'); expect(wrapper.text()).not.toContain(codes[0]); wrapper.unmount();
  });
  it('exige SUPPRIMER et conserve le compte si le backend refuse sa suppression', async () => {
    const wrapper = mount(PersonalDataControls, { props: { mfa: true }, global: { plugins: [router] } }); await wrapper.findAll('button').find(button => button.text() === 'Supprimer mon compte')!.trigger('click'); expect(wrapper.get('form .button-danger').attributes('disabled')).toBeDefined(); expect(wrapper.find('#personal-data-code').exists()).toBe(true); await wrapper.get('#delete-account-confirmation').setValue('SUPPRIMER'); await wrapper.get('#personal-data-password').setValue('A long passphrase 2026!'); await wrapper.get('#personal-data-code').setValue('123456'); api.mockRejectedValueOnce(new Error('Nommez un autre administrateur.')); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api).toHaveBeenLastCalledWith('/auth/account', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ currentPassword: 'A long passphrase 2026!', code: '123456', confirmation: 'SUPPRIMER' }) })); expect(authState.user.value?.id).toBe('owner'); expect(wrapper.get('[role="alert"]').text()).toContain('administrateur'); wrapper.unmount();
  });
  it('affiche une configuration OAuth absente sans proposer de faux lien de connexion', async () => {
    const wrapper = mount(OAuthLogin); expect(api).not.toHaveBeenCalled(); api.mockResolvedValueOnce(state.providers); (wrapper.get('details').element as HTMLDetailsElement).open = true; await wrapper.get('details').trigger('toggle'); await flushPromises(); expect(wrapper.text()).toContain('GitHub : configuration serveur requise'); expect(wrapper.findAll('a')).toHaveLength(0); wrapper.unmount();
  });
  it('confirme le lien e-mail uniquement après action et efface le fragment', async () => {
    await router.push(`/verify-email#token=${'a'.repeat(64)}`); const wrapper = mount(VerifyEmailView, { global: { plugins: [router] } }); expect(api).not.toHaveBeenCalled(); api.mockResolvedValueOnce({ changed: false }); await wrapper.get('button').trigger('click'); await flushPromises(); expect(api).toHaveBeenLastCalledWith('/auth/verify-email', expect.objectContaining({ body: JSON.stringify({ token: 'a'.repeat(64) }) })); expect(wrapper.get('[role="status"]').text()).toContain('est vérifiée'); expect(location.hash).toBe(''); wrapper.unmount();
  });
  it('demande le deuxième facteur après le mot de passe et ouvre la session seulement après succès', async () => {
    clearSession(); await router.push('/login'); const wrapper = mount(AuthView, { global: { plugins: [router] } }); await wrapper.get('#auth-email').setValue('alice@example.test'); await wrapper.get('#auth-password').setValue('A long passphrase 2026!'); api.mockRejectedValueOnce(new ApiRequestError('Code requis.', 401, 'MFA_REQUIRED')); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(authState.user.value).toBeNull(); expect(wrapper.get('#auth-password').element).toHaveProperty('value', 'A long passphrase 2026!'); await wrapper.get('#auth-mfa-code').setValue('123456'); api.mockResolvedValueOnce(profile); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(authState.user.value?.id).toBe('owner'); expect(api).toHaveBeenLastCalledWith('/auth/login', expect.objectContaining({ body: JSON.stringify({ email: 'alice@example.test', password: 'A long passphrase 2026!', code: '123456' }) })); wrapper.unmount();
  });
  it('termine le challenge OAuth par le deuxième facteur sans redemander ni transmettre un mot de passe', async () => {
    clearSession(); await router.push('/login?oauth=mfa'); const wrapper = mount(AuthView, { global: { plugins: [router] } }); expect(wrapper.find('#auth-password').exists()).toBe(false); await wrapper.get('#auth-mfa-code').setValue('123456'); api.mockResolvedValueOnce(profile); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api).toHaveBeenLastCalledWith('/auth/oauth/mfa', expect.objectContaining({ body: JSON.stringify({ code: '123456' }) })); expect(authState.user.value?.id).toBe('owner'); wrapper.unmount();
  });
});
