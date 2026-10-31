<script setup lang="ts">
import AppIcon from './AppIcon.vue';
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
  <section
    class="my-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#dfe5df] bg-[#f0f4ed] px-5 py-4"
    aria-label="Export du rapport"
  >
    <div class="flex items-center gap-3">
      <AppIcon
        name="file"
        :size="21"
        class="text-indigo-700"
      /><div>
        <h2 class="text-sm font-semibold">
          Votre rapport, à emporter
        </h2><p class="mt-1 text-xs text-slate-600">
          {{ status === 'SUCCEEDED' ? 'Les données enregistrées, dans un fichier JSON versionné.' : status === 'FAILED' ? 'Aucun rapport exportable pour un échec technique.' : 'L’export sera disponible après la réussite du traitement.' }}
        </p>
      </div>
    </div>
    <button
      class="button-secondary"
      :disabled="loading || status !== 'SUCCEEDED'"
      @click="download"
    >
      <span
        v-if="loading"
        class="spinner"
        aria-hidden="true"
      /><AppIcon
        v-else
        name="download"
        :size="17"
      />{{ loading ? 'Préparation du téléchargement…' : 'Exporter le rapport JSON' }}
    </button>
    <p
      v-if="error"
      role="alert"
      class="w-full text-sm text-red-800"
    >
      {{ error }} Réessayez le téléchargement.
    </p><p
      v-if="success"
      role="status"
      class="w-full text-sm text-emerald-800"
    >
      Téléchargement du rapport JSON déclenché.
    </p>
  </section>
</template>
