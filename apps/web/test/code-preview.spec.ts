import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodePreview from '../src/components/CodePreview.vue';
import IssuesTable from '../src/components/IssuesTable.vue';
import { highlight } from '../src/highlight';
import { analysesApi } from '../src/api/analyses';
import type { AnalysisCodeContext, AnalysisIssue } from '@codeaudit/contracts';
const issue: AnalysisIssue = { filePath: 'index.js', line: 2, column: 1, ruleId: 'no-undef', kind: 'lint', severity: 'error', message: 'Unknown.' };
const data: AnalysisCodeContext = { requested: true, context: { schemaVersion: 1, truncated: false, snippets: [{ filePath: 'index.js', lines: [{ number: 1, text: 'const value = "<script>bad()</script>";', truncated: false }, { number: 2, text: 'missing;', truncated: false }] }] } };
const wrappers: VueWrapper[] = [];
beforeEach(() => { vi.spyOn(analysesApi, 'context').mockResolvedValue(data); vi.spyOn(analysesApi, 'deleteContext').mockResolvedValue(undefined); });
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
describe('Aperçu du code', () => {
  it('conserve exactement le texte, sans générer ou interpréter du HTML', () => {
    const text = 'const value = "<script>bad()</script>"; // commentaire';
    expect(highlight(text).map(token => token.text).join('')).toBe(text);
    const wrapper = mount(CodePreview, { props: { filePath: issue.filePath, line: 2, data, loading: false, error: '' } }); wrappers.push(wrapper);
    expect(wrapper.text()).toContain('<script>bad()</script>'); expect(wrapper.find('script').exists()).toBe(false); expect(wrapper.text()).toContain('Ligne 2');
  });
  it('charge les extraits seulement à l’ouverture et partage la requête entre les lignes', async () => {
    const wrapper = mount(IssuesTable, { props: { issues: [issue, { ...issue, line: 1 }], analysisId: 'analysis' } }); wrappers.push(wrapper);
    expect(analysesApi.context).not.toHaveBeenCalled();
    for (const detail of wrapper.findAll('details')) { (detail.element as HTMLDetailsElement).open = true; await detail.trigger('toggle'); }
    await flushPromises(); expect(analysesApi.context).toHaveBeenCalledTimes(1); expect(wrapper.findAll('code').some(node => node.text().includes('missing;'))).toBe(true);
  });
  it('demande confirmation avant suppression et conserve les diagnostics', async () => {
    const wrapper = mount(IssuesTable, { props: { issues: [issue], analysisId: 'analysis' } }); wrappers.push(wrapper);
    const detail = wrapper.get('details'); (detail.element as HTMLDetailsElement).open = true; await detail.trigger('toggle'); await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Supprimer les extraits de code')!.trigger('click'); expect(analysesApi.deleteContext).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Confirmer la suppression des extraits')!.trigger('click'); await flushPromises();
    expect(analysesApi.deleteContext).toHaveBeenCalledWith('analysis', expect.any(AbortSignal)); expect(wrapper.text()).toContain('Unknown.'); expect(wrapper.text()).toContain('Aucun extrait conservé');
  });
  it('explique un aperçu non conservé ou sans position et une erreur récupérable', async () => {
    const wrapper = mount(CodePreview, { props: { filePath: issue.filePath, line: null, data: null, loading: false, error: '' } }); wrappers.push(wrapper);
    expect(wrapper.text()).toContain('ne fournit pas de position');
    await wrapper.setProps({ line: 2, data: { requested: false, context: null } }); expect(wrapper.text()).toContain('Aucun extrait conservé');
    await wrapper.setProps({ error: 'Serveur indisponible.' }); await wrapper.get('button').trigger('click'); expect(wrapper.emitted('open')).toBeTruthy();
  });
});
