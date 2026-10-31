<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { AnalysisSummary, GitImportRequest } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
const props = defineProps<{ projectId: string }>(); const router = useRouter();
const repository = ref(''); const mode = ref('ref'); const reference = ref(''); const pull = ref(''); const captureContext = ref(false); const busy = ref(false); const error = ref('');
let controller = new AbortController();
onScopeDispose(() => controller.abort());
watch(() => props.projectId, () => { controller.abort(); controller = new AbortController(); repository.value = ''; reference.value = ''; pull.value = ''; captureContext.value = false; busy.value = false; error.value = ''; });
async function submit() {
  if (busy.value) return; error.value = '';
  const value = repository.value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/.test(value)) { error.value = 'Utilisez le format propriétaire/dépôt GitHub, par exemple expressjs/cookie-parser.'; return; }
  const input: GitImportRequest = { repository: value, captureContext: captureContext.value };
  if (mode.value === 'pull') { const number = Number(pull.value); if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) { error.value = 'Indiquez un numéro de pull request valide.'; return; } input.pullRequest = number; }
  else if (reference.value.trim()) input.ref = reference.value.trim();
  const signal = controller.signal; busy.value = true;
  try { const analysis = await apiJson<AnalysisSummary>(`/projects/${encodeURIComponent(props.projectId)}/analyses/github`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    if (!signal.aborted) await router.push(`/analyses/${analysis.id}`);
  } catch (cause) { if (!signal.aborted) error.value = cause instanceof Error ? cause.message : 'Import Git impossible.'; }
  finally { if (!signal.aborted) busy.value = false; }
}
</script>
<template>
  <section
    class="panel mt-5"
    aria-labelledby="git-import-title"
  >
    <details>
      <summary class="cursor-pointer">
        <span
          id="git-import-title"
          class="font-semibold"
        >Analyser depuis GitHub</span><span class="ml-3 text-xs text-slate-500">Dépôt public ou pull request</span>
      </summary>
      <p class="mt-4 text-sm text-slate-600">
        Le commit résolu sera conservé avec l’analyse. Téléchargement limité à 10 Mio et 30 secondes, puis extraction contrôlée. Aucun script ou dépendance du dépôt n’est exécuté.
      </p>
      <form
        class="mt-5"
        :aria-busy="busy"
        @submit.prevent="submit"
      >
        <fieldset
          :disabled="busy"
          class="space-y-5"
        >
          <div>
            <label
              for="git-repository"
              class="field-label"
            >Dépôt GitHub public</label><input
              id="git-repository"
              v-model="repository"
              class="field"
              required
              maxlength="140"
              placeholder="propriétaire/dépôt"
              autocomplete="off"
            >
          </div>
          <fieldset class="flex flex-wrap gap-5">
            <legend class="field-label mb-2">
              Source à analyser
            </legend>
            <label class="flex items-center gap-2 text-sm"><input
              v-model="mode"
              type="radio"
              value="ref"
              name="git-mode"
            >Branche, tag ou commit</label>
            <label class="flex items-center gap-2 text-sm"><input
              v-model="mode"
              type="radio"
              value="pull"
              name="git-mode"
            >Pull request</label>
          </fieldset>
          <div v-if="mode === 'ref'">
            <label
              for="git-ref"
              class="field-label"
            >Référence (facultative)</label><input
              id="git-ref"
              v-model="reference"
              class="field"
              maxlength="200"
              placeholder="Branche par défaut si vide"
            ><p class="field-help">
              Le serveur résout la référence en commit avant de télécharger les sources.
            </p>
          </div>
          <div v-else>
            <label
              for="git-pull"
              class="field-label"
            >Numéro de pull request</label><input
              id="git-pull"
              v-model="pull"
              class="field"
              type="number"
              min="1"
              max="2147483647"
              required
            ><p class="field-help">
              La tête de la pull request est analysée, y compris si elle provient d’un fork public.
            </p>
          </div>
          <label class="flex items-start gap-3 text-sm"><input
            v-model="captureContext"
            type="checkbox"
            class="mt-1"
          >Conserver un aperçu du code pour les diagnostics Git</label>
          <p class="field-help">
            Option désactivée par défaut. Les extraits peuvent contenir des informations sensibles ; ils restent privés et peuvent être supprimés.
          </p>
          <button
            type="submit"
            class="button-primary"
          >
            <span
              v-if="busy"
              class="spinner"
              aria-hidden="true"
            />{{ busy ? 'Téléchargement et préparation…' : 'Importer et analyser depuis GitHub' }}
          </button>
        </fieldset>
      </form>
      <p
        v-if="error"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ error }}
      </p>
    </details>
  </section>
</template>
