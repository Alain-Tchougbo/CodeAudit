import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectQualityPolicy from '../src/components/ProjectQualityPolicy.vue';
import ProjectApiKeys from '../src/components/ProjectApiKeys.vue';
import QualityGateResult from '../src/components/QualityGateResult.vue';
import { analysesApi } from '../src/api/analyses';
const api = vi.hoisted(() => vi.fn()); vi.mock('../src/api/http', () => ({ apiJson: api }));
vi.mock('../src/api/analyses', () => ({ analysesApi: { gate: vi.fn() } }));
beforeEach(() => { api.mockReset(); vi.mocked(analysesApi.gate).mockReset(); }); afterEach(() => { vi.restoreAllMocks(); });
describe('Seuils et intégration CI', () => {
  it('enregistre les seuils explicites via le véritable contrat API', async () => {
    api.mockResolvedValueOnce({ policy: null }); const wrapper = mount(ProjectQualityPolicy, { props: { projectId: 'project' } }); await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true); await wrapper.get('#gate-warnings').setValue('2'); api.mockResolvedValueOnce({ policy: { schemaVersion: 1, enabled: true, maxErrors: 0, maxWarnings: 2 } }); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(api).toHaveBeenLastCalledWith('/projects/project/quality-policy', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ enabled: true, maxErrors: 0, maxWarnings: 2 }) })); expect(wrapper.get('[role="status"]').text()).toContain('prochaines analyses'); wrapper.unmount();
  });
  it('présente une décision négative avec les compteurs API', async () => {
    vi.mocked(analysesApi.gate).mockResolvedValue({ analysisId: 'analysis', schemaVersion: 1, status: 'FAIL', policy: { schemaVersion: 1, enabled: true, maxErrors: 0, maxWarnings: 0 }, observed: { errorCount: 0, warningCount: 1 }, criteria: [{ metric: 'warningCount', value: 1, maximum: 0, passed: false }] });
    const wrapper = mount(QualityGateResult, { props: { analysisId: 'analysis', status: 'SUCCEEDED' } }); await flushPromises(); expect(wrapper.text()).toContain('Seuils dépassés'); expect(wrapper.text()).toContain('Avertissements : 1 / 0 autorisés'); expect(wrapper.text()).toContain('Le rapport reste disponible'); wrapper.unmount();
  });
  it('n’invente pas un succès qualité après une erreur API', async () => {
    vi.mocked(analysesApi.gate).mockRejectedValue(new Error('Politique invalide.')); const wrapper = mount(QualityGateResult, { props: { analysisId: 'analysis', status: 'SUCCEEDED' } }); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('Politique invalide'); expect(wrapper.text()).not.toContain('Seuils respectés'); wrapper.unmount();
  });
  it('affiche la clé une seule fois en mémoire puis permet de la masquer', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem'); api.mockResolvedValue([]); const wrapper = mount(ProjectApiKeys, { props: { projectId: 'project' } }); await flushPromises();
    api.mockResolvedValueOnce({ key: { id: 'key' }, token: 'ca_test_secret' }); await wrapper.get('#api-key-name').setValue('CI'); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(wrapper.get('#api-key-secret').element).toHaveProperty('value', 'ca_test_secret'); expect(storage).not.toHaveBeenCalled();
    const hide = wrapper.findAll('button').find(button => button.text() === 'Masquer la clé')!; await hide.trigger('click'); expect(wrapper.find('#api-key-secret').exists()).toBe(false); wrapper.unmount();
  });
  it('confirme une révocation puis utilise uniquement l’identifiant public', async () => {
    api.mockResolvedValueOnce([{ id: 'public-key', projectId: 'project', name: 'Build', createdAt: '2026-10-31T08:00:00Z', expiresAt: '2026-11-01T08:00:00Z', lastUsedAt: null }]); const wrapper = mount(ProjectApiKeys, { props: { projectId: 'project' } }); await flushPromises(); await wrapper.get('button[aria-label="Révoquer la clé Build"]').trigger('click'); expect(api).toHaveBeenCalledTimes(1);
    api.mockResolvedValueOnce(undefined).mockResolvedValueOnce([]); await wrapper.get('.button-danger').trigger('click'); await flushPromises(); expect(api.mock.calls.some(call => call[0] === '/projects/project/api-keys/public-key' && call[1]?.method === 'DELETE')).toBe(true); expect(wrapper.get('[role="status"]').text()).toContain('Clé révoquée'); wrapper.unmount();
  });
});
