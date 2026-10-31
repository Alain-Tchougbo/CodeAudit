import { ref, shallowRef, watch } from 'vue';
import type { AnalysisCodeContext } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';

export function useCodeContext(id: () => string | undefined) {
  const data = shallowRef<AnalysisCodeContext | null>(null); const loading = ref(false); const error = ref(''); const removing = ref(false);
  let controller = new AbortController(); let pending: Promise<void> | undefined;
  watch(id, (_id, _previous, onCleanup) => {
    controller = new AbortController(); data.value = null; error.value = ''; loading.value = false; removing.value = false; pending = undefined;
    const current = controller; onCleanup(() => current.abort());
  }, { immediate: true });
  async function ensure(): Promise<void> {
    const analysisId = id(); if (!analysisId || data.value) return; if (pending) return pending;
    const current = controller; loading.value = true; error.value = '';
    pending = (async () => {
      try { const result = await analysesApi.context(analysisId, current.signal); if (!current.signal.aborted) data.value = result; }
      catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Extraits indisponibles.'; }
      finally { if (!current.signal.aborted) { loading.value = false; pending = undefined; } }
    })();
    return pending;
  }
  async function remove() {
    const analysisId = id(); if (!analysisId || removing.value) return;
    const current = controller; removing.value = true; error.value = '';
    try { await analysesApi.deleteContext(analysisId, current.signal); if (!current.signal.aborted) data.value = { requested: false, context: null }; }
    catch (cause) { if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Suppression des extraits impossible.'; }
    finally { if (!current.signal.aborted) removing.value = false; }
  }
  return { data, loading, error, removing, ensure, remove };
}
