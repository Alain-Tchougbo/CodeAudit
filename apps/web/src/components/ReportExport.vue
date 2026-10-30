<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AnalysisStatus } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';
import { saveReport } from '../download';
const props = defineProps<{ analysisId: string; status: AnalysisStatus }>();
const loading = ref(false);
const error = ref('');
const success = ref(false);
let signal: AbortSignal;
watch(() => props.analysisId, (_id, _previous, onCleanup) => {
  const controller = new AbortController(); signal = controller.signal;
  onCleanup(() => controller.abort());
  loading.value = false; error.value = ''; success.value = false;
}, { immediate: true });
async function download() {
  if (loading.value || props.status !== 'SUCCEEDED') return;
  const requestSignal = signal;
  const id = props.analysisId;
  loading.value = true; error.value = ''; success.value = false;
  try {
    const blob = await analysesApi.export(id, requestSignal);
    if (requestSignal.aborted) return;
    saveReport(blob, id); success.value = true;
  } catch (cause) {
    if (!requestSignal.aborted) error.value = cause instanceof Error ? cause.message : 'Impossible d’exporter le rapport.';
  } finally { if (!requestSignal.aborted) loading.value = false; }
}
</script>
<template>
  <div class="my-6">
    <button
      class="button-primary"
      :disabled="loading || status !== 'SUCCEEDED'"
      @click="download"
    >
      {{ loading ? 'Préparation du téléchargement…' : 'Exporter le rapport JSON' }}
    </button>
    <p
      v-if="status !== 'SUCCEEDED'"
      class="mt-2 text-sm text-slate-600"
    >
      {{ status === 'FAILED' ? 'Aucun rapport exportable pour un échec technique.' : 'L’export sera disponible après la réussite du traitement.' }}
    </p>
    <p
      v-if="error"
      role="alert"
      class="mt-3 text-sm text-red-800"
    >
      {{ error }} Réessayez le téléchargement.
    </p>
    <p
      v-if="success"
      role="status"
      class="mt-3 text-sm text-emerald-800"
    >
      Téléchargement du rapport JSON déclenché.
    </p>
  </div>
</template>
