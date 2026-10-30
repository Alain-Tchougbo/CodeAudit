<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AnalysisIssue } from '@codeaudit/contracts';
const props = defineProps<{ issues: AnalysisIssue[] }>();
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
    class="mt-8"
  >
    <h2
      id="issues-title"
      class="text-xl font-semibold"
    >
      Problèmes détectés
    </h2>
    <div class="panel mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          </option>
          <option value="error">
            Erreurs
          </option>
          <option value="warning">
            Avertissements
          </option>
        </select>
      </div>
      <div>
        <label
          for="issue-file"
          class="field-label"
        >Nom de fichier</label><input
          id="issue-file"
          v-model="file"
          type="search"
          class="field"
          placeholder="Ex. src/index.ts"
        >
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
    <div class="my-4 flex flex-wrap items-center justify-between gap-3">
      <p
        role="status"
        aria-live="polite"
        class="text-sm text-slate-600"
      >
        {{ filtered.length }} problème(s) correspondant(s) sur {{ issues.length }}
      </p>
      <button
        v-if="severity || file || rule"
        class="text-sm font-semibold text-indigo-700 underline"
        @click="reset"
      >
        Réinitialiser les filtres
      </button>
    </div>
    <p
      v-if="visible.length"
      class="mb-3 text-xs text-slate-500 lg:hidden"
    >
      Sur petit écran, faites défiler le tableau horizontalement pour lire la règle et le message.
    </p>
    <div
      v-if="!visible.length"
      class="panel py-10 text-center text-slate-600"
    >
      {{ issues.length ? 'Aucun problème ne correspond aux filtres.' : 'Aucun problème détecté dans cette analyse.' }}
    </div>
    <div
      v-else
      class="overflow-x-auto rounded-xl border border-slate-200 bg-white"
      role="region"
      aria-label="Résultats de l’analyse, défilement horizontal sur petit écran"
      tabindex="0"
    >
      <table class="w-full min-w-[760px] text-left text-sm">
        <caption class="sr-only">
          Problèmes détectés, page {{ page }} sur {{ pages }}
        </caption>
        <thead class="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th scope="col">
              Gravité
            </th><th scope="col">
              Fichier et position
            </th><th scope="col">
              Règle
            </th><th scope="col">
              Message
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr
            v-for="(issue, index) in visible"
            :key="index"
            class="align-top hover:bg-slate-50"
          >
            <td>
              <span
                class="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'"
              >{{ issue.severity === 'error' ? 'Erreur' : 'Avertissement' }}</span>
            </td>
            <td class="max-w-xs">
              <p class="break-all font-mono text-xs font-medium text-slate-900">
                {{ issue.filePath }}
              </p><p class="mt-2 text-xs text-slate-500">
                Ligne {{ issue.line ?? '—' }} · Colonne {{ issue.column ?? '—' }}
              </p>
            </td>
            <td class="max-w-56 break-words font-mono text-xs">
              {{ issue.ruleId ?? 'Sans règle (syntaxe)' }}
            </td>
            <td class="min-w-56 whitespace-pre-wrap break-words text-slate-700">
              {{ issue.message }}
            </td>
          </tr>
        </tbody>
      </table>
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
        Précédent
      </button><span class="text-sm text-slate-600">Page {{ page }} sur {{ pages }}</span><button
        class="button-secondary"
        :disabled="page >= pages"
        @click="page++"
      >
        Suivant
      </button>
    </nav>
  </section>
</template>
