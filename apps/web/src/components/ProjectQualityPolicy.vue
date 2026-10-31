<script setup lang="ts">
import { ref, watch } from 'vue';
import type { QualityPolicy } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
const props = withDefaults(defineProps<{ projectId: string; canEdit?: boolean }>(), { canEdit: true });
const { data, loading, error, reload } = useResource(signal => apiJson<{ policy: QualityPolicy | null }>(`/projects/${encodeURIComponent(props.projectId)}/quality-policy`, { signal }), () => props.projectId);
const enabled = ref(false); const errors = ref(0); const warnings = ref(0); const busy = ref(false); const feedback = ref(''); const actionError = ref('');
watch(data, value => { enabled.value = value?.policy?.enabled ?? false; errors.value = value?.policy?.maxErrors ?? 0; warnings.value = value?.policy?.maxWarnings ?? 0; });
async function save() {
  if (busy.value || !props.canEdit) return; busy.value = true; feedback.value = ''; actionError.value = ''; const id = props.projectId;
  try { const result = await apiJson<{ policy: QualityPolicy }>(`/projects/${encodeURIComponent(id)}/quality-policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: enabled.value, maxErrors: errors.value, maxWarnings: warnings.value }) });
    if (id === props.projectId) { data.value = result; feedback.value = 'Seuils enregistrés pour les prochaines analyses.'; }
  } catch (cause) { if (id === props.projectId) actionError.value = cause instanceof Error ? cause.message : 'Enregistrement impossible.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section
    class="panel mb-6"
    aria-labelledby="quality-policy-title"
  >
    <details>
      <summary class="cursor-pointer">
        <span
          id="quality-policy-title"
          class="font-semibold"
        >Seuils qualité</span><span
          v-if="data"
          class="ml-3 text-xs text-slate-500"
        >{{ data.policy?.enabled ? 'Activés' : 'Non configurés ou désactivés' }}</span>
      </summary>
      <ResourceState
        :loading="loading"
        :error="error"
        @retry="reload"
      />
      <form
        v-if="data && !loading && !error"
        class="mt-5"
        :aria-busy="busy"
        @submit.prevent="save"
      >
        <fieldset
          :disabled="busy || !canEdit"
          class="space-y-5"
        >
          <label class="flex items-center gap-3 text-sm"><input
            v-model="enabled"
            type="checkbox"
          >Appliquer des seuils qualité aux prochaines analyses</label>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                for="gate-errors"
                class="field-label"
              >Erreurs maximales autorisées</label><input
                id="gate-errors"
                v-model.number="errors"
                type="number"
                min="0"
                max="1000000"
                step="1"
                class="field"
                required
              >
            </div><div>
              <label
                for="gate-warnings"
                class="field-label"
              >Avertissements maximaux autorisés</label><input
                id="gate-warnings"
                v-model.number="warnings"
                type="number"
                min="0"
                max="1000000"
                step="1"
                class="field"
                required
              >
            </div>
          </div>
          <p class="field-help">
            Le seuil est inclusif. Les erreurs de syntaxe sont déjà comptées dans les erreurs. Une décision qualité négative ne transforme pas une analyse terminée en échec technique. Les analyses déjà demandées gardent leurs seuils.
          </p>
          <button
            type="submit"
            class="button-secondary"
          >
            {{ busy ? 'Enregistrement…' : 'Enregistrer les seuils' }}
          </button>
        </fieldset>
      </form>
      <p
        v-if="feedback"
        role="status"
        class="notice notice-success mt-4"
      >
        {{ feedback }}
      </p><p
        v-if="actionError"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ actionError }}
      </p>
    </details>
  </section>
</template>
