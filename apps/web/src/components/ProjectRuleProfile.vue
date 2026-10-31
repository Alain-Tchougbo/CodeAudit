<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ProjectRuleProfile } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
const props = withDefaults(defineProps<{ projectId: string; canEdit?: boolean }>(), { canEdit: true });
const { data, loading, error, reload } = useResource(signal => apiJson<ProjectRuleProfile>(`/projects/${encodeURIComponent(props.projectId)}/rule-profile`, { signal }), () => props.projectId);
const selected = ref(''); const busy = ref(false); const feedback = ref(''); const actionError = ref('');
watch(data, value => { selected.value = value?.selectedVersion ?? ''; });
watch(() => props.projectId, () => { feedback.value = ''; actionError.value = ''; });
const profile = computed(() => data.value?.profiles.find(item => item.version === selected.value));
async function save() {
  if (busy.value || !props.canEdit) return; busy.value = true; feedback.value = ''; actionError.value = ''; const id = props.projectId;
  try { const result = await apiJson<ProjectRuleProfile>(`/projects/${encodeURIComponent(id)}/rule-profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: selected.value }) });
    if (props.projectId === id) { data.value = result; feedback.value = 'Profil enregistré pour les prochaines analyses.'; }
  } catch (cause) { if (props.projectId === id) actionError.value = cause instanceof Error ? cause.message : 'Enregistrement impossible.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section
    class="panel mb-7"
    aria-labelledby="rule-profile-title"
  >
    <div class="section-heading">
      <div>
        <p class="eyebrow">
          Configuration de l’analyse
        </p><h2 id="rule-profile-title">
          Profil de règles
        </h2>
      </div>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <form
      v-if="data && !loading && !error"
      :aria-busy="busy"
      @submit.prevent="save"
    >
      <label
        for="rule-profile"
        class="field-label"
      >Profil des prochaines analyses</label>
      <div class="flex flex-wrap items-end gap-3">
        <select
          id="rule-profile"
          v-model="selected"
          class="field min-w-0 flex-1"
          :disabled="busy || !canEdit"
        >
          <option
            v-for="option in data.profiles"
            :key="option.version"
            :value="option.version"
          >
            {{ option.name }} · {{ option.version }}
          </option>
        </select>
        <button
          type="submit"
          class="button-secondary"
          :disabled="busy || !canEdit || selected === data.selectedVersion"
        >
          {{ busy ? 'Enregistrement…' : 'Enregistrer le profil' }}
        </button>
      </div>
      <p class="field-help">
        {{ profile?.description }}
      </p>
      <p class="field-help">
        Les analyses déjà demandées et les rapports historiques conservent leur profil. Les profils différents ne peuvent pas être comparés.
      </p>
      <details
        v-if="profile"
        class="mt-4 text-xs"
      >
        <summary class="cursor-pointer text-link">
          Voir les règles contrôlées
        </summary>
        <div class="mt-3 grid gap-5 md:grid-cols-2">
          <div
            v-for="language in (['javascript', 'typescript'] as const)"
            :key="language"
            class="min-w-0"
          >
            <h3 class="font-semibold">
              {{ language === 'javascript' ? 'JavaScript' : 'TypeScript' }}
            </h3>
            <dl class="mt-2 space-y-2">
              <div
                v-for="(configuration, rule) in profile.rules[language]"
                :key="rule"
                class="break-words border-b border-slate-100 pb-2"
              >
                <dt class="font-mono">
                  {{ rule }}
                </dt><dd class="mt-1 text-slate-500">
                  {{ JSON.stringify(configuration) }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </details>
    </form>
    <p
      v-if="feedback"
      role="status"
      class="notice notice-success mt-4"
    >
      {{ feedback }}
    </p>
    <p
      v-if="actionError"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ actionError }}
    </p>
  </section>
</template>
