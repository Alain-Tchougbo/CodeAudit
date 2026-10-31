import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisSummary } from '@codeaudit/contracts';
import CancelAnalysis from '../src/components/CancelAnalysis.vue';
import { analysesApi } from '../src/api/analyses';
vi.mock('../src/api/analyses', () => ({ analysesApi: { cancel: vi.fn() } }));
const analysis: AnalysisSummary = { permissions: { write: true, admin: true }, id: 'analysis', projectId: 'project', status: 'RUNNING', createdAt: '2026-10-31T08:00:00Z', startedAt: '2026-10-31T08:00:01Z', finishedAt: null, error: null, profileVersion: 'v1', statistics: null };
beforeEach(() => { vi.mocked(analysesApi.cancel).mockReset(); }); afterEach(() => vi.restoreAllMocks());
describe('Annulation d’une analyse', () => {
  it('demande confirmation puis transmet l’identifiant à l’API sans annoncer une fin prématurée', async () => {
    vi.mocked(analysesApi.cancel).mockResolvedValue({ ...analysis, cancelRequestedAt: '2026-10-31T08:00:02Z' });
    const wrapper = mount(CancelAnalysis, { props: { analysis } }); await wrapper.get('button').trigger('click');
    expect(analysesApi.cancel).not.toHaveBeenCalled(); await wrapper.get('.button-danger').trigger('click'); await flushPromises();
    expect(analysesApi.cancel).toHaveBeenCalledWith('analysis', expect.any(AbortSignal)); expect(wrapper.emitted('updated')).toHaveLength(1); expect(wrapper.text()).not.toContain('Analyse annulée'); wrapper.unmount();
  });
  it('permet de renoncer à la confirmation au clavier', async () => {
    const wrapper = mount(CancelAnalysis, { props: { analysis } }); await wrapper.get('button').trigger('click'); await wrapper.get('section').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('section').exists()).toBe(false); expect(analysesApi.cancel).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('conserve une erreur API et ne confirme pas la demande', async () => {
    vi.mocked(analysesApi.cancel).mockRejectedValue(new Error('Analyse déjà terminée.'));
    const wrapper = mount(CancelAnalysis, { props: { analysis } }); await wrapper.get('button').trigger('click'); await wrapper.get('.button-danger').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('déjà terminée'); expect(wrapper.emitted('updated')).toBeUndefined(); wrapper.unmount();
  });
  it('explique l’attente d’un arrêt confirmé et évite une seconde demande', () => {
    const wrapper = mount(CancelAnalysis, { props: { analysis: { ...analysis, cancelRequestedAt: '2026-10-31T08:00:02Z' } } });
    expect(wrapper.get('[role="status"]').text()).toContain('doit arrêter le moteur'); expect(wrapper.find('button').exists()).toBe(false); wrapper.unmount();
  });
  it('ne propose aucune annulation pour les états terminaux', () => {
    for (const status of ['CANCELLED', 'SUCCEEDED', 'FAILED'] as const) {
      const wrapper = mount(CancelAnalysis, { props: { analysis: { ...analysis, status } } }); expect(wrapper.find('button').exists()).toBe(false); wrapper.unmount();
    }
  });
});
