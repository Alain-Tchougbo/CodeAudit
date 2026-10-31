import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import GitAnalysisImport from '../src/components/GitAnalysisImport.vue';
const api = vi.hoisted(() => vi.fn()); vi.mock('../src/api/http', () => ({ apiJson: api }));
beforeEach(() => { api.mockReset(); });
async function screen() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<p />' } }, { path: '/analyses/:id', component: { template: '<p />' } }] }); await router.push('/'); await router.isReady();
  return { router, wrapper: mount(GitAnalysisImport, { props: { projectId: 'project' }, global: { plugins: [router] } }) };
}
describe('Import GitHub', () => {
  it('envoie la référence choisie à l’API sans conservation d’extraits par défaut', async () => {
    const { wrapper, router } = await screen(); api.mockResolvedValue({ id: 'analysis' });
    await wrapper.get('#git-repository').setValue('example/source'); await wrapper.get('#git-ref').setValue('feature/test'); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(api).toHaveBeenCalledWith('/projects/project/analyses/github', expect.objectContaining({ method: 'POST', body: JSON.stringify({ repository: 'example/source', captureContext: false, ref: 'feature/test' }) }));
    expect(router.currentRoute.value.path).toBe('/analyses/analysis'); wrapper.unmount();
  });
  it('sépare le numéro de PR de la référence et transmet le consentement explicite', async () => {
    const { wrapper } = await screen(); api.mockResolvedValue({ id: 'analysis' });
    await wrapper.get('#git-repository').setValue('example/source'); await wrapper.get('input[value="pull"]').setValue(true); await wrapper.get('#git-pull').setValue('12'); await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    const body = JSON.parse(api.mock.calls[0]![1].body as string); expect(body).toEqual({ repository: 'example/source', captureContext: true, pullRequest: 12 }); expect(body.ref).toBeUndefined(); wrapper.unmount();
  });
  it('refuse les URL arbitraires puis affiche une erreur fournisseur sans naviguer', async () => {
    const { wrapper, router } = await screen(); await wrapper.get('#git-repository').setValue('https://127.0.0.1/internal'); await wrapper.get('form').trigger('submit');
    expect(api).not.toHaveBeenCalled(); expect(wrapper.get('[role="alert"]').text()).toContain('propriétaire/dépôt');
    await wrapper.get('#git-repository').setValue('example/source'); api.mockRejectedValueOnce(new Error('La limite GitHub est atteinte.')); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('limite GitHub'); expect(router.currentRoute.value.path).toBe('/'); wrapper.unmount();
  });
});
