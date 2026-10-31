import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AnalysisComparison, AnalysisIssue, AnalysisSummary } from '@codeaudit/contracts';
import { analysesApi } from '../src/api/analyses';
import ProjectAnalyses from '../src/components/ProjectAnalyses.vue';
import AnalysisComparisonView from '../src/views/AnalysisComparisonView.vue';

const baseline: AnalysisSummary = { id: 'baseline', projectId: 'project', createdAt: '2026-10-30T08:00:00Z', startedAt: '2026-10-30T08:00:00Z', finishedAt: '2026-10-30T08:00:01Z', status: 'SUCCEEDED', profileVersion: 'v1', error: null, statistics: { analyzedFileCount: 1, affectedFileCount: 1, errorCount: 1, warningCount: 1, syntaxErrorCount: 0 } };
const target: AnalysisSummary = { ...baseline, id: 'target', createdAt: '2026-10-31T08:00:00Z' };
const issue: AnalysisIssue = { filePath: 'index.js', line: 2, column: 1, ruleId: 'no-debugger', severity: 'error', kind: 'lint', message: 'Unexpected debugger.' };
const result: AnalysisComparison = { schemaVersion: 1, matchingVersion: 'file-rule-message-v1', baseline, target, counts: { added: 1, persistent: 1, resolved: 1, moved: 1 }, deltas: { errorCount: 1, warningCount: -1, analyzedFileCount: 0, affectedFileCount: 0 }, added: [issue], resolved: [{ ...issue, ruleId: 'no-console', severity: 'warning', message: 'Unexpected console.' }], persistent: [{ baseline: { ...issue, ruleId: 'no-undef', line: 1 }, target: { ...issue, ruleId: 'no-undef', line: 9 }, positionChanged: true }], coverage: { newlyAnalyzedFiles: [], noLongerAnalyzedFiles: [] } };
const wrappers: VueWrapper[] = [];
async function screen(path = '/analyses/target/compare?baseline=baseline', history = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/analyses/:id/compare', name: 'analysis-comparison', component: AnalysisComparisonView },
    { path: '/analyses/:id', component: { template: '<p>Analyse</p>' } },
    { path: '/projects/:id', component: { template: '<p>Projet</p>' } },
  ] });
  await router.push(path); await router.isReady();
  const wrapper = history ? mount(ProjectAnalyses, { props: { projectId: 'project' }, global: { plugins: [router] } }) : mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  wrappers.push(wrapper); return { wrapper, router };
}
beforeEach(() => { vi.spyOn(analysesApi, 'compare').mockResolvedValue(result); vi.spyOn(analysesApi, 'history').mockResolvedValue({ items: [target, baseline], nextCursor: null }); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
describe('Comparaison des analyses', () => {
  it('attend les données réelles et appelle le couple demandé', async () => {
    let resolve!: (value: AnalysisComparison) => void; vi.mocked(analysesApi.compare).mockReturnValue(new Promise(done => { resolve = done; }));
    const { wrapper } = await screen(); expect(wrapper.findAll('dd')).toHaveLength(0); expect(wrapper.get('[role="status"]').text()).toContain('Chargement');
    resolve(result); await flushPromises();
    expect(analysesApi.compare).toHaveBeenCalledWith('target', 'baseline', expect.any(AbortSignal));
    expect(wrapper.text()).toContain('Écart cible − référence : +1 erreurs · -1 avertissements'); expect(wrapper.get('tbody').text()).toContain('no-debugger');
  });
  it('change de catégorie et garde les filtres de diagnostics', async () => {
    const { wrapper } = await screen(); await flushPromises();
    await wrapper.findAll('[aria-pressed]').find(button => button.text().startsWith('Résolus'))!.trigger('click');
    expect(wrapper.get('tbody').text()).toContain('no-console'); expect(wrapper.text()).toContain('positions du rapport de référence');
    await wrapper.get('#issue-severity').setValue('error'); expect(wrapper.text()).toContain('Aucun problème ne correspond aux filtres.');
    await wrapper.findAll('[aria-pressed]').find(button => button.text().startsWith('Persistants'))!.trigger('click');
    expect(wrapper.get('tbody').text()).toContain('no-undef'); expect(wrapper.get('tbody').text()).toContain('Ligne 9');
  });
  it('explique une catégorie vide sans prétendre que le rapport complet est propre', async () => {
    vi.mocked(analysesApi.compare).mockResolvedValue({ ...result, added: [], counts: { ...result.counts, added: 0 } });
    const { wrapper } = await screen(); await flushPromises();
    expect(wrapper.text()).toContain('Aucun problème dans cette catégorie.'); expect(wrapper.text()).not.toContain('Aucun problème détecté dans cette analyse.');
  });
  it('affiche un refus API et permet de réessayer sans faux compteurs', async () => {
    vi.mocked(analysesApi.compare).mockRejectedValueOnce(new Error('Profils incompatibles.'));
    const { wrapper } = await screen(); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toContain('Profils incompatibles.'); expect(wrapper.findAll('dd')).toHaveLength(0);
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises(); expect(wrapper.find('tbody').exists()).toBe(true);
  });
  it('inverse le sens puis ignore une réponse ancienne', async () => {
    const { wrapper, router } = await screen(); await flushPromises();
    let resolve!: (value: AnalysisComparison) => void; vi.mocked(analysesApi.compare).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    await router.push('/analyses/old/compare?baseline=baseline'); await flushPromises();
    await router.push('/analyses/target/compare?baseline=baseline'); await flushPromises();
    resolve({ ...result, target: { ...target, id: 'old' }, added: [{ ...issue, message: 'Stale result' }] }); await flushPromises(); expect(wrapper.text()).not.toContain('Stale result');
    const invert = wrapper.findAll('a').find(link => link.text().startsWith('Inverser'))!; await invert.trigger('click'); await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/analyses/baseline/compare?baseline=target');
  });
  it('explique les changements de couverture et ne transforme pas les chemins en HTML', async () => {
    vi.mocked(analysesApi.compare).mockResolvedValue({ ...result, coverage: { newlyAnalyzedFiles: ['<script>bad</script>.js'], noLongerAnalyzedFiles: ['old.js'] } });
    const { wrapper } = await screen(); await flushPromises(); expect(wrapper.text()).toContain('Le périmètre des fichiers analysés a changé'); expect(wrapper.text()).toContain('<script>bad</script>.js'); expect(wrapper.find('script').exists()).toBe(false);
  });
});
describe('Sélection dans l’historique', () => {
  it('sélectionne deux succès sur des pages différentes et conserve le sens chronologique', async () => {
    vi.mocked(analysesApi.history).mockResolvedValueOnce({ items: [target], nextCursor: 'next' }).mockResolvedValue({ items: [baseline], nextCursor: null });
    const { wrapper } = await screen('/projects/project', true); await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.get('nav button:last-child').trigger('click'); await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(true); await flushPromises();
    expect(wrapper.get('a[href*="/compare"]').attributes('href')).toBe('/analyses/target/compare?baseline=baseline');
    await wrapper.setProps({ projectId: 'other' }); await flushPromises(); expect(wrapper.find('a[href*="/compare"]').exists()).toBe(false);
  });
  it('empêche la sélection d’échecs et de plus de deux analyses', async () => {
    vi.mocked(analysesApi.history).mockResolvedValue({ items: [target, baseline, { ...target, id: 'third' }, { ...target, id: 'failed', status: 'FAILED' }], nextCursor: null });
    const { wrapper } = await screen('/projects/project', true); await flushPromises();
    const boxes = wrapper.findAll('input[type="checkbox"]'); expect(boxes[3]!.attributes('disabled')).toBeDefined();
    await boxes[0]!.setValue(true); await boxes[1]!.setValue(true); expect(boxes[2]!.attributes('disabled')).toBeDefined();
    await boxes[0]!.setValue(false); expect(boxes[2]!.attributes('disabled')).toBeUndefined();
  });
});
