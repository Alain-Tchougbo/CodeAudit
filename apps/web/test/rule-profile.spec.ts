import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ProjectRuleProfile from '../src/components/ProjectRuleProfile.vue';
const api = vi.hoisted(() => vi.fn());
vi.mock('../src/api/http', () => ({ apiJson: api }));
const value = { selectedVersion: 'base-v1', profiles: [
  { version: 'base-v1', name: 'Essentiel', description: 'Profil historique', rules: { javascript: { 'no-console': 'warn' }, typescript: {} } },
  { version: 'strict-v1', name: 'Strict', description: 'Plus strict', rules: { javascript: { 'no-console': 'error' }, typescript: {} } },
] };
beforeEach(() => { api.mockReset(); api.mockResolvedValue(structuredClone(value)); });
afterEach(() => { vi.restoreAllMocks(); });
describe('Configuration du profil projet', () => {
  it('lit les profils depuis l’API et enregistre seulement le choix explicite', async () => {
    const wrapper = mount(ProjectRuleProfile, { props: { projectId: 'project-1' } }); await flushPromises();
    expect(api.mock.calls[0]![0]).toBe('/projects/project-1/rule-profile'); expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.get('select').setValue('strict-v1'); api.mockResolvedValueOnce({ ...value, selectedVersion: 'strict-v1' }); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(api).toHaveBeenLastCalledWith('/projects/project-1/rule-profile', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ version: 'strict-v1' }) }));
    expect(wrapper.get('[role="status"]').text()).toContain('prochaines analyses'); expect(wrapper.text()).toContain('no-console'); wrapper.unmount();
  });
  it('ne confirme pas un enregistrement rejeté', async () => {
    const wrapper = mount(ProjectRuleProfile, { props: { projectId: 'project-1' } }); await flushPromises(); await wrapper.get('select').setValue('strict-v1');
    api.mockRejectedValueOnce(new Error('Accès refusé')); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Accès refusé'); expect(wrapper.find('[role="status"]').exists()).toBe(false); wrapper.unmount();
  });
});
