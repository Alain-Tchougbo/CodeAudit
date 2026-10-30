import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analysesApi } from '../src/api/analyses';
import * as download from '../src/download';
import ReportExport from '../src/components/ReportExport.vue';
const wrappers: VueWrapper[] = [];
const blob = new Blob(['{"schemaVersion":1}'], { type: 'application/json' });
function screen(status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED') {
  const wrapper = mount(ReportExport, { props: { analysisId: 'old-analysis', status } }); wrappers.push(wrapper); return wrapper;
}
beforeEach(() => { vi.spyOn(analysesApi, 'export').mockResolvedValue(blob); vi.spyOn(download, 'saveReport').mockImplementation(() => {}); });
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); vi.restoreAllMocks(); });
describe('Export JSON', () => {
  it.each(['QUEUED', 'RUNNING', 'FAILED'] as const)('desactive le telechargement pour %s', async (state) => {
    const wrapper = screen(state); expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    await wrapper.get('button').trigger('click'); expect(analysesApi.export).not.toHaveBeenCalled();
  });
  it('telecharge le fichier du serveur sans tenir compte des filtres ou recalculer son JSON', async () => {
    const wrapper = screen(); await wrapper.get('button').trigger('click'); await flushPromises();
    expect(analysesApi.export).toHaveBeenCalledExactlyOnceWith('old-analysis', expect.any(AbortSignal));
    expect(download.saveReport).toHaveBeenCalledExactlyOnceWith(blob, 'old-analysis');
    expect(wrapper.get('[role="status"]').text()).toContain('Téléchargement');
  });
  it('bloque les doubles clics pendant la preparation', async () => {
    let resolve!: (value: Blob) => void;
    vi.mocked(analysesApi.export).mockReturnValue(new Promise((done) => { resolve = done; }));
    const wrapper = screen(); await wrapper.get('button').trigger('click'); await wrapper.get('button').trigger('click');
    expect(wrapper.get('button').attributes('disabled')).toBeDefined(); expect(analysesApi.export).toHaveBeenCalledTimes(1);
    resolve(blob); await flushPromises(); expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
  });
  it('affiche les erreurs et permet de reessayer sans creer un faux fichier', async () => {
    vi.mocked(analysesApi.export).mockRejectedValueOnce(new Error('Analyse introuvable.'));
    const wrapper = screen(); await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Analyse introuvable.'); expect(download.saveReport).not.toHaveBeenCalled();
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(download.saveReport).toHaveBeenCalledTimes(1);
  });
  it('annule la requete au demontage et ignore une reponse tardive', async () => {
    let resolve!: (value: Blob) => void;
    vi.mocked(analysesApi.export).mockReturnValue(new Promise((done) => { resolve = done; }));
    const wrapper = screen(); await wrapper.get('button').trigger('click');
    const signal = vi.mocked(analysesApi.export).mock.calls[0]![1]!; wrapper.unmount(); expect(signal.aborted).toBe(true);
    resolve(blob); await flushPromises(); expect(download.saveReport).not.toHaveBeenCalled();
  });
  it('ne telecharge pas le resultat de la precedente analyse apres un changement de route', async () => {
    let resolve!: (value: Blob) => void;
    vi.mocked(analysesApi.export).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const wrapper = screen(); await wrapper.get('button').trigger('click');
    await wrapper.setProps({ analysisId: 'new-analysis' }); resolve(blob); await flushPromises();
    expect(download.saveReport).not.toHaveBeenCalled();
    await wrapper.get('button').trigger('click'); await flushPromises(); expect(download.saveReport).toHaveBeenCalledWith(blob, 'new-analysis');
  });
});
