import { ref, shallowRef, watch } from 'vue';
import type { AnalysisResults, AnalysisSummary } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';

export function useAnalysisDetail(key: () => string) {
  const data = shallowRef<{ analysis: AnalysisSummary; report: AnalysisResults | null } | null>(null);
  const loading = ref(true);
  const error = ref('');
  const now = ref(Date.now());
  const revision = ref(0);
  watch([key, revision], ([id], _old, onCleanup) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clock = setInterval(() => { now.value = Date.now(); }, 1000);
    onCleanup(() => { controller.abort(); clearTimeout(timer); clearInterval(clock); });
    data.value = null; loading.value = true; error.value = '';
    async function load() {
      try {
        const analysis = await analysesApi.get(String(id), controller.signal);
        const report = analysis.status === 'SUCCEEDED' ? await analysesApi.results(String(id), controller.signal) : null;
        if (controller.signal.aborted) return;
        data.value = { analysis, report };
        if (analysis.status === 'QUEUED' || analysis.status === 'RUNNING') timer = setTimeout(() => { void load(); }, 3000);
        else clearInterval(clock);
      } catch (cause) {
        if (!controller.signal.aborted) { error.value = cause instanceof Error ? cause.message : 'Impossible de charger l’analyse.'; clearInterval(clock); }
      } finally { if (!controller.signal.aborted) loading.value = false; }
    }
    void load();
  }, { immediate: true });
  return { data, loading, error, now, reload: () => { revision.value++; } };
}
