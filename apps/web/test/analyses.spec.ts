import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AnalysisIssue, AnalysisResults, AnalysisSummary, Dashboard } from '@codeaudit/contracts';
import { analysesApi } from '../src/api/analyses';
import HomeView from '../src/views/HomeView.vue';
import AnalysisDetailView from '../src/views/AnalysisDetailView.vue';
import IssuesTable from '../src/components/IssuesTable.vue';
import ProjectAnalyses from '../src/components/ProjectAnalyses.vue';

const analysis: AnalysisSummary = {
  id: 'analysis-id', projectId: 'project-id', status: 'SUCCEEDED',
  createdAt: '2026-10-30T08:00:00Z', startedAt: '2026-10-30T08:00:01Z', finishedAt: '2026-10-30T08:00:03Z',
  profileVersion: 'codeaudit-js-ts-v1', error: null,
  statistics: { analyzedFileCount: 3, affectedFileCount: 1, errorCount: 1, warningCount: 1, syntaxErrorCount: 0 },
};
const issue: AnalysisIssue = { filePath: 'src/index.ts', severity: 'error', ruleId: 'no-undef', message: 'Unknown variable.', line: 4, column: 8, kind: 'lint' };
const report: AnalysisResults = {
  schemaVersion: 1, profile: { version: 'codeaudit-js-ts-v1' }, issues: [issue],
  statistics: { ...analysis.statistics!, durationMs: 1250, ignoredEntryCount: 2, bytesRead: 512 },
};
const dashboard: Dashboard = {
  cancelledCount: 0,
  projectCount: 2, analysisCount: 7, completedCount: 5, succeededCount: 3, failedCount: 2,
  queuedCount: 1, runningCount: 1, errorCount: 9, warningCount: 4,
  latestAnalyses: [{ ...analysis, projectName: 'Projet API' }],
};
const wrappers: VueWrapper[] = [];
async function screen(path = '/') {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: HomeView }, { path: '/analyses/:id', component: AnalysisDetailView },
    { path: '/projects/:id?', component: { template: '<p>Projet</p>' } },
  ] });
  await router.push(path); await router.isReady();
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  wrappers.push(wrapper);
  return { wrapper, router };
}
function issues(items: AnalysisIssue[]) { const wrapper = mount(IssuesTable, { props: { issues: items } }); wrappers.push(wrapper); return wrapper; }
beforeEach(() => {
  vi.spyOn(analysesApi, 'gate').mockResolvedValue({ analysisId: analysis.id, schemaVersion: 1, status: 'NOT_CONFIGURED', policy: null, observed: null, criteria: [] });
  vi.spyOn(analysesApi, 'dashboard').mockResolvedValue(dashboard);
  vi.spyOn(analysesApi, 'get').mockResolvedValue(analysis);
  vi.spyOn(analysesApi, 'results').mockResolvedValue(report);
  vi.spyOn(analysesApi, 'history').mockResolvedValue({ items: [analysis], nextCursor: null });
});
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('Tableau de bord', () => {
  it('attend la réponse sans afficher de statistiques provisoires', async () => {
    let resolve!: (value: Dashboard) => void;
    vi.mocked(analysesApi.dashboard).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { wrapper } = await screen();
    expect(wrapper.get('[role="status"]').text()).toContain('Chargement');
    expect(wrapper.findAll('dd')).toHaveLength(0);
    resolve(dashboard); await flushPromises();
    expect(wrapper.findAll('dd').map((item) => item.text())).toContain('5');
    expect(wrapper.get('a[href="/analyses/analysis-id"]').text()).toContain('Projet API');
    expect(wrapper.text()).toContain('Diagnostics cumulés');
    expect(wrapper.text()).toContain('9'); expect(wrapper.text()).toContain('4');
  });
  it('affiche les zéros réels et explique l’absence de rapport', async () => {
    vi.mocked(analysesApi.dashboard).mockResolvedValue({ ...dashboard, projectCount: 0, analysisCount: 0, completedCount: 0, succeededCount: 0, failedCount: 0, queuedCount: 0, runningCount: 0, errorCount: 0, warningCount: 0, latestAnalyses: [] });
    const { wrapper } = await screen(); await flushPromises();
    expect(wrapper.text()).toContain('Aucune analyse pour le moment');
    expect(wrapper.text()).toContain('Aucun rapport disponible');
    expect(wrapper.findAll('li')).toHaveLength(0);
  });
  it('permet de réessayer après une erreur sans masquer celle-ci par des zéros', async () => {
    vi.mocked(analysesApi.dashboard).mockRejectedValueOnce(new Error('Base indisponible.'));
    const { wrapper } = await screen(); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Base indisponible.');
    expect(wrapper.findAll('dd')).toHaveLength(0);
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Projet API');
  });
});

describe('Filtres et pagination des diagnostics', () => {
  const many: AnalysisIssue[] = [...Array.from({ length: 23 }, (_, index) => ({ ...issue, filePath: `src/a${index}.ts` })),
    ...Array.from({ length: 2 }, () => ({ ...issue, severity: 'warning' as const, ruleId: '@typescript-eslint/no-unused-vars', filePath: 'src/Component.tsx' }))];
  it('pagine les problèmes et réinitialise la page lors du filtrage', async () => {
    const wrapper = issues(many);
    expect(wrapper.findAll('tbody tr')).toHaveLength(20);
    await wrapper.get('nav button:last-child').trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(5); expect(wrapper.text()).toContain('Page 2 sur 2');
    await wrapper.get('#issue-severity').setValue('warning');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2); expect(wrapper.text()).toContain('Page 1 sur 1');
    expect(wrapper.get('nav button:last-child').attributes('disabled')).toBeDefined();
  });
  it('combine gravité, recherche insensible à la casse et règle', async () => {
    const wrapper = issues(many);
    await wrapper.get('#issue-severity').setValue('warning');
    await wrapper.get('#issue-file').setValue(' COMPONENT.TSX ');
    await wrapper.get('#issue-rule').setValue('@typescript-eslint/no-unused-vars');
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    await wrapper.get('#issue-file').setValue('absent');
    expect(wrapper.text()).toContain('Aucun problème ne correspond');
    await wrapper.get('button').trigger('click');
    expect(wrapper.findAll('tbody tr')).toHaveLength(20);
  });
  it('gère les règles nulles et les positions manquantes, sans interpréter le message comme HTML', async () => {
    const wrapper = issues([{ ...issue, ruleId: null, kind: 'syntax', line: null, column: null, message: '<script>unsafe()</script>' }, issue]);
    await wrapper.get('#issue-rule').setValue('__syntax');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Ligne — · Colonne —');
    expect(wrapper.text()).toContain('<script>unsafe()</script>'); expect(wrapper.find('script').exists()).toBe(false);
  });
  it('distingue un rapport propre et accepte un changement de taille de page', async () => {
    const wrapper = issues([]); expect(wrapper.text()).toContain('Aucun problème détecté dans cette analyse.');
    await wrapper.setProps({ issues: many }); await wrapper.get('#issue-page-size').setValue('50');
    expect(wrapper.findAll('tbody tr')).toHaveLength(25);
  });
});

describe('Détail d’une analyse', () => {
  it('affiche le rapport, la durée réelle et les positions', async () => {
    const { wrapper } = await screen('/analyses/analysis-id'); await flushPromises();
    expect(wrapper.text()).toContain('Terminée'); expect(wrapper.text()).toContain('2 s');
    expect(wrapper.text()).toContain('1,3 s'); expect(wrapper.text()).toContain('Ligne 4 · Colonne 8');
    expect(wrapper.find('a[href="/projects/project-id"]').exists()).toBe(true);
  });
  it('explique un échec technique sans demander de rapport', async () => {
    vi.mocked(analysesApi.get).mockResolvedValue({ ...analysis, status: 'FAILED', error: { code: 'ANALYSIS_TIMEOUT', message: 'Délai dépassé.' }, statistics: null });
    const { wrapper } = await screen('/analyses/failed'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Délai dépassé.');
    expect(analysesApi.results).not.toHaveBeenCalled(); expect(wrapper.find('table').exists()).toBe(false);
  });
  it('distingue une annulation et arrête le suivi sans demander de rapport', async () => {
    vi.useFakeTimers(); vi.mocked(analysesApi.get).mockResolvedValue({ ...analysis, status: 'CANCELLED', error: null, statistics: null });
    const { wrapper } = await screen('/analyses/cancelled'); await flushPromises();
    expect(wrapper.text()).toContain('Annulée'); expect(wrapper.text()).toContain('Aucun rapport n’a été publié'); expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(analysesApi.results).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(9000); expect(analysesApi.get).toHaveBeenCalledTimes(1);
  });
  it('suit QUEUED puis RUNNING puis SUCCEEDED et arrête le polling', async () => {
    vi.useFakeTimers();
    vi.mocked(analysesApi.get).mockResolvedValueOnce({ ...analysis, status: 'QUEUED', startedAt: null, finishedAt: null }).mockResolvedValueOnce({ ...analysis, status: 'RUNNING', finishedAt: null }).mockResolvedValue(analysis);
    const { wrapper } = await screen('/analyses/live'); await flushPromises();
    expect(wrapper.text()).toContain('attend un worker'); expect(analysesApi.results).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000); await flushPromises(); expect(wrapper.text()).toContain('Analyse en cours.');
    await vi.advanceTimersByTimeAsync(3000); await flushPromises(); expect(wrapper.find('table').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(9000); expect(analysesApi.get).toHaveBeenCalledTimes(3);
  });
  it('annule le polling au démontage', async () => {
    vi.useFakeTimers(); vi.mocked(analysesApi.get).mockResolvedValue({ ...analysis, status: 'RUNNING', finishedAt: null });
    const { wrapper } = await screen('/analyses/live'); await flushPromises(); wrapper.unmount();
    await vi.advanceTimersByTimeAsync(9000); expect(analysesApi.get).toHaveBeenCalledTimes(1);
  });
  it('ignore une réponse tardive après navigation vers une autre analyse', async () => {
    let resolve!: (value: AnalysisSummary) => void;
    vi.mocked(analysesApi.get).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const { wrapper, router } = await screen('/analyses/old');
    await router.push('/analyses/new'); await flushPromises();
    resolve({ ...analysis, id: 'old', status: 'FAILED' }); await flushPromises();
    expect(wrapper.text()).toContain('Terminée'); expect(wrapper.text()).not.toContain('Le traitement n’a pas abouti');
  });
  it('affiche les erreurs de lecture du rapport et permet une nouvelle tentative', async () => {
    vi.mocked(analysesApi.results).mockRejectedValueOnce(new Error('Rapport indisponible.'));
    const { wrapper } = await screen('/analyses/id'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Rapport indisponible.');
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises(); expect(wrapper.find('table').exists()).toBe(true);
  });
});

describe('Historique du projet', () => {
  it('navigue avec les curseurs API, revient en arrière et réinitialise à un autre projet', async () => {
    vi.mocked(analysesApi.history).mockResolvedValueOnce({ items: [analysis], nextCursor: 'next' }).mockResolvedValue({ items: [analysis], nextCursor: null });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/analyses/:id', component: AnalysisDetailView }] });
    const wrapper = mount(ProjectAnalyses, { props: { projectId: 'p1' }, global: { plugins: [router] } }); wrappers.push(wrapper);
    await flushPromises(); await wrapper.get('nav button:last-child').trigger('click'); await flushPromises();
    expect(analysesApi.history).toHaveBeenLastCalledWith('p1', 'next', expect.any(AbortSignal));
    expect(wrapper.text()).toContain('Page 2');
    await wrapper.get('nav button:first-child').trigger('click'); await flushPromises();
    expect(analysesApi.history).toHaveBeenLastCalledWith('p1', undefined, expect.any(AbortSignal));
    await wrapper.setProps({ projectId: 'p2' }); await flushPromises();
    expect(analysesApi.history).toHaveBeenLastCalledWith('p2', undefined, expect.any(AbortSignal));
  });
  it('affiche un historique vide', async () => {
    vi.mocked(analysesApi.history).mockResolvedValue({ items: [], nextCursor: null });
    const wrapper = mount(ProjectAnalyses, { props: { projectId: 'p' } }); wrappers.push(wrapper); await flushPromises();
    expect(wrapper.text()).toContain('Aucune analyse pour ce projet.'); expect(wrapper.find('nav').exists()).toBe(false);
  });
});
