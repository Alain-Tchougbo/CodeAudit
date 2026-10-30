<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ANALYSIS_ARCHIVE_MAX_BYTES } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';
const props = defineProps<{ projectId: string }>();
const router = useRouter();
const file = shallowRef<File | null>(null);
const busy = ref(false);
const error = ref('');
let signal: AbortSignal;
watch(() => props.projectId, (_id, _old, onCleanup) => {
  const controller = new AbortController(); signal = controller.signal;
  onCleanup(() => controller.abort()); file.value = null; busy.value = false; error.value = '';
}, { immediate: true });
function select(event: Event) { file.value = (event.target as HTMLInputElement).files?.[0] ?? null; error.value = ''; }
async function submit() {
  if (busy.value) return;
  const archive = file.value;
  if (!archive) { error.value = 'Sélectionnez une archive ZIP.'; return; }
  if (!archive.name.toLowerCase().endsWith('.zip')) { error.value = 'Le fichier doit être une archive .zip.'; return; }
  if (!archive.size || archive.size > ANALYSIS_ARCHIVE_MAX_BYTES) { error.value = 'L’archive doit être non vide et ne pas dépasser 10 Mio.'; return; }
  const requestSignal = signal; busy.value = true; error.value = '';
  try {
    const analysis = await analysesApi.create(props.projectId, archive, requestSignal);
    if (!requestSignal.aborted) await router.push(`/analyses/${analysis.id}`);
  } catch (cause) {
    if (!requestSignal.aborted) error.value = cause instanceof Error ? cause.message : 'Impossible de demander cette analyse.';
  } finally { if (!requestSignal.aborted) busy.value = false; }
}
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="import-title"
  >
    <h2
      id="import-title"
      class="text-xl font-semibold"
    >
      Nouvelle analyse
    </h2>
    <p
      id="archive-help"
      class="mt-2 text-sm text-slate-600"
    >
      ZIP de 10 Mio maximum, contenant des fichiers JavaScript ou TypeScript. Les sources sont supprimées après traitement ; les rapports sont conservés.
    </p>
    <form
      class="mt-5"
      @submit.prevent="submit"
    >
      <fieldset :disabled="busy">
        <label
          for="archive-input"
          class="field-label"
        >Archive ZIP du projet</label>
        <input
          id="archive-input"
          type="file"
          accept=".zip,application/zip"
          aria-describedby="archive-help"
          class="field file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-800"
          @change="select"
        >
        <button
          type="submit"
          class="button-primary mt-4"
          :disabled="busy || !file"
        >
          {{ busy ? 'Import en cours…' : 'Lancer l’analyse' }}
        </button>
      </fieldset>
    </form>
    <p
      v-if="busy"
      role="status"
      class="mt-3 text-sm text-slate-600"
    >
      Vérification de l’archive. Vous serez dirigé vers le suivi après sa prise en charge.
    </p>
    <div
      v-if="error"
      role="alert"
      class="mt-4 text-sm text-red-800"
    >
      <p>{{ error }}</p><p class="mt-2">
        En cas de coupure de connexion, vérifiez l’historique avant de renvoyer l’archive : une demande déjà acceptée peut continuer.
      </p>
    </div>
  </section>
</template>
