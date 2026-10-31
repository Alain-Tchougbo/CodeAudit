import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ANALYSIS_ARCHIVE_MAX_BYTES, type AnalysisSummary } from '@codeaudit/contracts';
import AnalysisImport from '../src/components/AnalysisImport.vue';
import { analysesApi } from '../src/api/analyses';
const wrappers: VueWrapper[] = [];
const result: AnalysisSummary = { permissions: { write: true, admin: true }, id: 'queued-id', projectId: 'project-id', status: 'QUEUED', createdAt: '2026-10-31T00:00:00Z', startedAt: null, finishedAt: null, profileVersion: null, error: null, statistics: null };
async function screen() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<p>Projet</p>' } }, { path: '/analyses/:id', component: { template: '<p>Suivi</p>' } }] });
  await router.push('/'); await router.isReady();
  const wrapper = mount(AnalysisImport, { props: { projectId: 'project-id' }, global: { plugins: [router] } }); wrappers.push(wrapper);
  return { wrapper, router };
}
async function select(wrapper: VueWrapper, file: File) { Object.defineProperty(wrapper.get('input').element, 'files', { value: [file], configurable: true }); await wrapper.get('input').trigger('change'); }
beforeEach(() => { vi.spyOn(analysesApi, 'create').mockResolvedValue(result); });
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks(); });
describe('Import ZIP', () => {
  it('demande un fichier avant toute requete', async () => {
    const { wrapper } = await screen(); expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('form').trigger('submit'); expect(wrapper.get('[role="alert"]').text()).toContain('Sélectionnez'); expect(analysesApi.create).not.toHaveBeenCalled();
  });
  it.each(['wrong-extension', 'too-large', 'empty'])('refuse une entree invalide (%s)', async (kind) => {
    const { wrapper } = await screen(); const file = new File(kind === 'empty' ? [] : ['data'], kind === 'wrong-extension' ? 'source.txt' : 'project.zip');
    if (kind === 'too-large') Object.defineProperty(file, 'size', { value: ANALYSIS_ARCHIVE_MAX_BYTES + 1 });
    await select(wrapper, file); await wrapper.get('form').trigger('submit'); expect(wrapper.find('[role="alert"]').exists()).toBe(true); expect(analysesApi.create).not.toHaveBeenCalled();
  });
  it('envoie le fichier reel et ouvre le suivi de la reponse API', async () => {
    const { wrapper, router } = await screen(); const file = new File(['ZIP contents'], 'project.ZIP', { type: 'application/zip' });
    await select(wrapper, file); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(analysesApi.create).toHaveBeenCalledExactlyOnceWith('project-id', file, expect.any(AbortSignal)); expect(router.currentRoute.value.path).toBe('/analyses/queued-id');
  });
  it('bloque les doubles soumissions et les controles pendant l’import', async () => {
    let resolve!: (value: AnalysisSummary) => void; vi.mocked(analysesApi.create).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { wrapper } = await screen(); await select(wrapper, new File(['ZIP'], 'project.zip'));
    await wrapper.get('form').trigger('submit'); await wrapper.get('form').trigger('submit');
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined(); expect(analysesApi.create).toHaveBeenCalledTimes(1);
    resolve(result); await flushPromises();
  });
  it('presente une erreur serveur sans inventer une analyse et permet une nouvelle tentative', async () => {
    vi.mocked(analysesApi.create).mockRejectedValueOnce(new Error('Archive ZIP invalide.'));
    const { wrapper, router } = await screen(); await select(wrapper, new File(['ZIP'], 'project.zip')); await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Archive ZIP invalide.'); expect(router.currentRoute.value.path).toBe('/');
    await wrapper.get('form').trigger('submit'); await flushPromises(); expect(router.currentRoute.value.path).toBe('/analyses/queued-id');
  });
  it('annule la requete au demontage sans redirection tardive', async () => {
    let resolve!: (value: AnalysisSummary) => void; vi.mocked(analysesApi.create).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { wrapper, router } = await screen(); await select(wrapper, new File(['ZIP'], 'project.zip')); await wrapper.get('form').trigger('submit');
    const signal = vi.mocked(analysesApi.create).mock.calls[0]![2]!; wrapper.unmount(); expect(signal.aborted).toBe(true);
    resolve(result); await flushPromises(); expect(router.currentRoute.value.path).toBe('/');
  });
});
