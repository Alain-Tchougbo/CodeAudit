<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ANALYSIS_ARCHIVE_MAX_BYTES } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';
const props = defineProps<{ projectId: string }>();
const router = useRouter();
const file = shallowRef<File | null>(null);
const busy = ref(false);
const error = ref('');
const captureContext = ref(false);
let signal: AbortSignal;
watch(() => props.projectId, (_id, _old, onCleanup) => {
  const controller = new AbortController(); signal = controller.signal;
  onCleanup(() => controller.abort()); file.value = null; busy.value = false; error.value = ''; captureContext.value = false;
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
    const analysis = captureContext.value ? await analysesApi.create(props.projectId, archive, requestSignal, { captureContext: true }) : await analysesApi.create(props.projectId, archive, requestSignal);
    if (!requestSignal.aborted) await router.push(`/analyses/${analysis.id}`);
  } catch (cause) {
    if (!requestSignal.aborted) error.value = cause instanceof Error ? cause.message : 'Impossible de demander cette analyse.';
  } finally { if (!requestSignal.aborted) busy.value = false; }
}
</script>
<template>
  <section
    class="panel"
    aria-labelledby="import-title"
  >
    <div class="grid gap-7 lg:grid-cols-[1fr_1fr]">
      <div>
        <span class="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-[#edf5e9] text-indigo-700"><AppIcon
          name="upload"
          :size="20"
        /></span><h2
          id="import-title"
          class="text-xl font-semibold tracking-tight"
        >
          Nouvelle analyse
        </h2><p
          id="archive-help"
          class="mt-3 max-w-lg text-sm text-slate-600"
        >
          ZIP de 10 Mio maximum, contenant des fichiers JavaScript ou TypeScript. Les sources sont supprimées après traitement ; les rapports sont conservés.
        </p><div class="mt-5 flex gap-2">
          <span class="code-chip">.zip</span><span class="code-chip">JavaScript</span><span class="code-chip">TypeScript</span>
        </div>
      </div>
      <form
        :aria-busy="busy"
        class="rounded-lg border border-dashed border-[#b5cbb8] bg-[#f9fcf6] p-5 sm:p-6"
        @submit.prevent="submit"
      >
        <fieldset :disabled="busy">
          <label
            id="archive-label"
            for="archive-input"
            class="field-label"
          >Archive ZIP du projet</label><p class="mb-4 text-xs text-slate-500">
            Sélectionnez les sources à analyser.
          </p><input
            id="archive-input"
            type="file"
            accept=".zip,application/zip"
            aria-describedby="archive-help"
            aria-labelledby="archive-label"
            class="peer sr-only"
            @change="select"
          ><label
            for="archive-input"
            class="flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border border-[#cbd6ce] bg-white px-4 py-3 text-sm text-indigo-800 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#26785b] peer-disabled:cursor-not-allowed peer-disabled:opacity-60"
          ><AppIcon
            name="folder"
            :size="20"
          /><span>{{ file ? 'Changer d’archive' : 'Choisir une archive ZIP' }}</span></label><p
            v-if="file"
            class="mt-3 break-all font-mono text-xs text-slate-600"
          >
            {{ file.name }} · {{ (file.size / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) }} Kio
          </p><label class="mt-5 flex items-start gap-3 text-xs leading-6 text-slate-700"><input
            v-model="captureContext"
            type="checkbox"
            class="mt-1.5 size-4 shrink-0 accent-[#176448]"
            aria-describedby="context-consent-help"
          ><span>Conserver un aperçu du code pour les diagnostics</span></label><p
            id="context-consent-help"
            class="mt-2 text-xs leading-5 text-slate-500"
          >
            Facultatif : des extraits limités seront conservés avec l’analyse et pourront être supprimés. Ils peuvent contenir des informations sensibles. Les sources complètes restent temporaires.
          </p><button
            type="submit"
            class="button-primary mt-5 w-full sm:w-auto"
            :disabled="busy || !file"
          >
            <span
              v-if="busy"
              class="spinner"
              aria-hidden="true"
            /><AppIcon
              v-else
              name="arrow"
              :size="17"
            />{{ busy ? 'Import en cours…' : 'Lancer l’analyse' }}
          </button>
        </fieldset>
      </form>
    </div>
    <p
      v-if="busy"
      role="status"
      class="notice notice-info mt-5 mb-0"
    >
      Vérification de l’archive. Vous serez dirigé vers le suivi après sa prise en charge.
    </p>
    <div
      v-if="error"
      role="alert"
      class="notice notice-error mt-5 mb-0 block"
    >
      <p class="font-medium">
        {{ error }}
      </p><p class="mt-2 text-xs">
        En cas de coupure de connexion, vérifiez l’historique avant de renvoyer l’archive : une demande déjà acceptée peut continuer.
      </p>
    </div>
  </section>
</template>
