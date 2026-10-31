import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamMembers from '../src/components/TeamMembers.vue';
import TeamInvitations from '../src/components/TeamInvitations.vue';
import ProjectSharing from '../src/components/ProjectSharing.vue';
import TeamInvitationView from '../src/views/TeamInvitationView.vue';
import ProjectQualityPolicy from '../src/components/ProjectQualityPolicy.vue';
import ProjectRuleProfile from '../src/components/ProjectRuleProfile.vue';
import { invitationToken } from '../src/invitation-state';
import { acceptProfile, clearSession } from '../src/auth-state';
const api = vi.hoisted(() => vi.fn()); vi.mock('../src/api/http', () => ({ apiJson: api }));
beforeEach(() => { api.mockReset(); invitationToken.value = ''; clearSession(); }); afterEach(() => { vi.restoreAllMocks(); });
const member = { userId: 'reader', name: 'Camille', role: 'READER' as const, joinedAt: '2026-10-31T08:00:00Z' };
const team = { id: 'team', name: 'Platform', role: 'ADMIN', createdAt: '2026-10-31T08:00:00Z', memberCount: 1, projectCount: 0 };
describe('Collaboration et permissions', () => {
  it('ne propose au lecteur que son propre départ', async () => {
    const wrapper = mount(TeamMembers, { props: { teamId: 'team', members: [member, { ...member, userId: 'other' }], viewerId: 'reader', admin: false } });
    expect(wrapper.findAll('select')).toHaveLength(0); expect(wrapper.findAll('button')).toHaveLength(1); expect(wrapper.get('button').text()).toBe('Quitter'); wrapper.unmount();
  });
  it('confirme les changements de droits et conserve l’erreur du dernier administrateur', async () => {
    const wrapper = mount(TeamMembers, { props: { teamId: 'team', members: [member], viewerId: 'admin', admin: true } });
    await wrapper.get('select').setValue('ADMIN'); await wrapper.get('button[aria-label^="Modifier"]').trigger('click'); expect(api).not.toHaveBeenCalled(); api.mockRejectedValueOnce(new Error('Le dernier administrateur doit rester.'));
    await wrapper.get('.button-danger').trigger('click'); await flushPromises(); expect(api).toHaveBeenCalledWith('/teams/team/members/reader', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ role: 'ADMIN' }) })); expect(wrapper.get('[role="alert"]').text()).toContain('dernier administrateur'); wrapper.unmount();
  });
  it('exige une confirmation explicite avant de partager tout l’historique', async () => {
    api.mockResolvedValueOnce([team, { ...team, id: 'readonly', role: 'READER' }]); const wrapper = mount(ProjectSharing, { props: { projectId: 'project' }, global: { stubs: { RouterLink: true } } }); await flushPromises();
    expect(wrapper.findAll('option')).toHaveLength(2); await wrapper.get('select').setValue('team'); await wrapper.get('form').trigger('submit'); expect(api).toHaveBeenCalledTimes(1); expect(wrapper.text()).toContain('Les clés CI existantes seront révoquées');
    api.mockResolvedValueOnce(undefined); await wrapper.get('.button-primary').trigger('click'); await flushPromises(); expect(api).toHaveBeenLastCalledWith('/projects/project/team', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ teamId: 'team' }) })); expect(wrapper.emitted('updated')).toHaveLength(1); wrapper.unmount();
  });
  it('n’annonce pas un envoi réussi lorsque SMTP échoue', async () => {
    api.mockResolvedValueOnce([]); const wrapper = mount(TeamInvitations, { props: { teamId: 'team' } }); await flushPromises();
    api.mockRejectedValueOnce(new Error('Invitation non envoyée.')); await wrapper.get('#invite-email').setValue('Person@example.test'); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('non envoyée'); expect(wrapper.find('[role="status"]').exists()).toBe(false); expect(api).toHaveBeenLastCalledWith('/teams/team/invitations', expect.objectContaining({ body: JSON.stringify({ email: 'person@example.test', role: 'MEMBER' }) })); wrapper.unmount();
  });
  it('désactive les réglages du profil et des seuils sans permission administrateur', async () => {
    api.mockResolvedValue({ policy: null }); const quality = mount(ProjectQualityPolicy, { props: { projectId: 'project', canEdit: false } }); await flushPromises(); expect(quality.get('fieldset').attributes('disabled')).toBeDefined(); quality.unmount();
    api.mockResolvedValue({ selectedVersion: 'v1', profiles: [{ version: 'v1', name: 'Essentiel', description: 'Profile', rules: {} }] }); const profile = mount(ProjectRuleProfile, { props: { projectId: 'project', canEdit: false } }); await flushPromises(); expect(profile.get('select').attributes('disabled')).toBeDefined(); expect(profile.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true); profile.unmount();
  });
  it('conserve le lien seulement en mémoire à travers la connexion et jamais dans la redirection', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/team-invitation', component: TeamInvitationView }, { path: '/login', component: { template: '<div>Login</div>' } }, { path: '/register', component: { template: '<div>Register</div>' } }] });
    const storage = vi.spyOn(Storage.prototype, 'setItem'); await router.push(`/team-invitation#token=${'a'.repeat(64)}`); await router.isReady(); const wrapper = mount(TeamInvitationView, { global: { plugins: [router] } }); await flushPromises();
    expect(invitationToken.value).toBe('a'.repeat(64)); const link = wrapper.findAll('a').find(item => item.text() === 'Se connecter')!; expect(link.attributes('href')).toBe('/login?redirect=/team-invitation'); expect(storage).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('consomme le lien reçu et navigue seulement après la réponse API', async () => {
    acceptProfile({ user: { id: 'recipient', name: 'Camille', email: 'camille@example.test', createdAt: '2026-10-31T08:00:00Z' }, csrfToken: 'csrf', expiresAt: '2026-11-01T08:00:00Z' }); invitationToken.value = 'c'.repeat(64);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/team-invitation', component: TeamInvitationView }, { path: '/teams/:id', component: { template: '<div>Team</div>' } }] }); await router.push('/team-invitation'); await router.isReady(); api.mockResolvedValueOnce({ teamId: 'team', teamName: 'Platform', role: 'READER', expiresAt: '2026-11-07T08:00:00Z' });
    const wrapper = mount(TeamInvitationView, { global: { plugins: [router] } }); await flushPromises(); api.mockResolvedValueOnce({ teamId: 'team' }); await wrapper.get('.button-primary').trigger('click'); await flushPromises(); expect(api).toHaveBeenLastCalledWith('/team-invitations/accept', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'c'.repeat(64) }) })); expect(router.currentRoute.value.path).toBe('/teams/team'); expect(invitationToken.value).toBe(''); wrapper.unmount();
  });
});
