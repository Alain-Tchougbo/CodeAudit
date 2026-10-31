<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import EmptyState from './EmptyState.vue';
import CodePreview from './CodePreview.vue';
import { useCodeContext } from '../composables/useCodeContext';
import { computed, ref, watch } from 'vue';
import type { AnalysisIssue } from '@codeaudit/contracts';
const props = withDefaults(defineProps<{ issues: AnalysisIssue[]; title?: string; emptyTitle?: string; emptyDescription?: string; analysisId?: string }>(), {
  analysisId: undefined,
  title: 'Problèmes détectés', emptyTitle: 'Aucun problème détecté dans cette analyse.', emptyDescription: 'Le moteur n’a relevé aucun diagnostic pour le profil de règles utilisé.',
});
const context = useCodeContext(() => props.analysisId);
const confirmingDelete = ref(false);
async function removeContext() { await context.remove(); confirmingDelete.value = false; }
const severity = ref('');
const file = ref('');
const rule = ref('');
const page = ref(1);
const pageSize = ref(20);
const rules = computed(() => [...new Set(props.issues.map((issue) => issue.ruleId).filter((value): value is string => value !== null))].sort());
const filtered = computed(() => props.issues.filter((issue) => (!severity.value || issue.severity === severity.value)
  && issue.filePath.toLocaleLowerCase().includes(file.value.trim().toLocaleLowerCase())
  && (!rule.value || (rule.value === '__syntax' ? issue.ruleId === null : issue.ruleId === rule.value))));
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
watch([severity, file, rule, pageSize, () => props.issues], () => { page.value = 1; });
function reset() { severity.value = ''; file.value = ''; rule.value = ''; }
</script>
<template>
  <section
    aria-labelledby="issues-title"
    class="mt-9"
  >
    <div class="section-heading">
      <div>
        <h2 id="issues-title">
          {{ title }}
        </h2><p class="mt-2 text-xs text-slate-500">
          Du fichier au diagnostic, retrouvez ce qui mérite votre attention.
        </p>
      </div><span class="code-chip">{{ issues.length }} diagnostic{{ issues.length > 1 ? 's' : '' }}</span>
    </div>
    <div
      v-if="context.data.value?.context"
      class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dfe5df] bg-[#f0f4ed] p-4 text-xs"
    >
      <p>{{ context.data.value.context.truncated ? 'Certains extraits sont limités ou indisponibles.' : 'Extraits conservés pour cette analyse.' }}</p>
      <button
        class="text-link text-xs"
        :disabled="context.removing.value"
        @click="confirmingDelete = !confirmingDelete"
      >
        Supprimer les extraits de code
      </button>
      <div
        v-if="confirmingDelete"
        class="w-full border-t border-[#dfe5df] pt-3"
      >
        <p>Supprimer définitivement tous les extraits de cette analyse ? Le rapport de diagnostics restera disponible.</p><div class="mt-3 flex flex-wrap gap-3">
          <button
            class="button-danger"
            :disabled="context.removing.value"
            @click="removeContext"
          >
            {{ context.removing.value ? 'Suppression…' : 'Confirmer la suppression des extraits' }}
          </button><button
            class="button-secondary"
            :disabled="context.removing.value"
            @click="confirmingDelete = false"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
    <p
      v-if="context.error.value"
      role="alert"
      class="notice notice-error"
    >
      {{ context.error.value }}
    </p>
    <div class="table-surface">
      <div class="grid gap-4 border-b border-[#dfe5df] bg-[#fafbf8] p-5 sm:grid-cols-2 xl:grid-cols-[1fr_1.3fr_1.3fr_130px]">
        <div>
          <label
            for="issue-severity"
            class="field-label"
          >Gravité</label><select
            id="issue-severity"
            v-model="severity"
            class="field"
          >
            <option value="">
              Toutes les gravités
            </option><option value="error">
              Erreurs
            </option><option value="warning">
              Avertissements
            </option>
          </select>
        </div>
        <div>
          <label
            for="issue-file"
            class="field-label"
          >Nom de fichier</label><div class="relative">
            <AppIcon
              name="search"
              :size="16"
              class="pointer-events-none absolute top-3.5 left-3 text-slate-500"
            /><input
              id="issue-file"
              v-model="file"
              type="search"
              class="field pl-9"
              placeholder="Ex. src/index.ts"
            >
          </div>
        </div>
        <div>
          <label
            for="issue-rule"
            class="field-label"
          >Règle ESLint</label><select
            id="issue-rule"
            v-model="rule"
            class="field"
          >
            <option value="">
              Toutes les règles
            </option><option
              v-for="item in rules"
              :key="item"
              :value="item"
            >
              {{ item }}
            </option><option
              v-if="issues.some(issue => issue.ruleId === null)"
              value="__syntax"
            >
              Sans règle (syntaxe)
            </option>
          </select>
        </div>
        <div>
          <label
            for="issue-page-size"
            class="field-label"
          >Résultats par page</label><select
            id="issue-page-size"
            v-model.number="pageSize"
            class="field"
          >
            <option :value="20">
              20
            </option><option :value="50">
              50
            </option><option :value="100">
              100
            </option>
          </select>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#e9ede5] px-5 py-3">
        <p
          role="status"
          aria-live="polite"
          class="text-xs text-slate-600"
        >
          {{ filtered.length }} problème(s) correspondant(s) sur {{ issues.length }}
        </p><button
          v-if="severity || file || rule"
          class="text-link min-h-8 text-xs"
          @click="reset"
        >
          <AppIcon
            name="refresh"
            :size="14"
          />Réinitialiser les filtres
        </button>
      </div>
      <EmptyState
        v-if="!visible.length"
        :title="issues.length ? 'Aucun problème ne correspond aux filtres.' : emptyTitle"
        :description="issues.length ? 'Ajustez la gravité, le fichier ou la règle pour élargir votre recherche.' : emptyDescription"
        :icon="issues.length ? 'search' : 'check'"
      />
      <div v-else>
        <table
          class="data-table diagnostics-table table-fixed"
          role="table"
        >
          <caption class="sr-only">
            {{ title }}, page {{ page }} sur {{ pages }}
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                class="w-[160px]"
              >
                Gravité
              </th><th
                scope="col"
                class="w-[27%]"
              >
                Fichier et position
              </th><th
                scope="col"
                class="w-[23%]"
              >
                Règle
              </th><th scope="col">
                Message
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(issue, index) in visible"
              :key="index"
            >
              <td>
                <span
                  class="status-badge"
                  :class="issue.severity === 'error' ? 'badge-error' : 'badge-warning'"
                ><AppIcon
                  name="warning"
                  :size="12"
                />{{ issue.severity === 'error' ? 'Erreur' : 'Avertissement' }}</span>
              </td>
              <td>
                <p class="diagnostic-path font-medium text-slate-900">
                  {{ issue.filePath }}
                </p><p class="mt-2 font-mono text-[10px] text-slate-500">
                  Ligne {{ issue.line ?? '—' }} · Colonne {{ issue.column ?? '—' }}
                </p>
              </td>
              <td>
                <span
                  class="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:hidden"
                  aria-hidden="true"
                >Règle</span><code class="break-words text-[11px] text-[#496351] [overflow-wrap:anywhere]">{{ issue.ruleId ?? 'Sans règle (syntaxe)' }}</code>
              </td>
              <td>
                <p class="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700 [overflow-wrap:anywhere]">
                  {{ issue.message }}
                </p>
                <CodePreview
                  v-if="analysisId"
                  :file-path="issue.filePath"
                  :line="issue.line"
                  :data="context.data.value"
                  :loading="context.loading.value"
                  :error="context.error.value"
                  @open="context.ensure"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <nav
      v-if="filtered.length"
      class="mt-5 flex flex-wrap items-center justify-between gap-4"
      aria-label="Pagination des problèmes"
    >
      <button
        class="button-secondary"
        :disabled="page === 1"
        @click="page--"
      >
        <AppIcon
          name="back"
          :size="15"
        />Précédent
      </button><span class="text-xs text-slate-600">Page {{ page }} sur {{ pages }}</span><button
        class="button-secondary"
        :disabled="page >= pages"
        @click="page++"
      >
        Suivant<AppIcon
          name="arrow"
          :size="15"
        />
      </button>
    </nav>
  </section>
</template>
