<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import ResourceState from '../components/ResourceState.vue';
import IssuesTable from '../components/IssuesTable.vue';
import MetricCard from '../components/MetricCard.vue';
import AppIcon from '../components/AppIcon.vue';
import { date, number } from '../format';
const route = useRoute();
const key = () => `${String(route.params.id)}:${String(route.query.baseline ?? '')}`;
const { data, loading, error, reload } = useResource(signal => analysesApi.compare(String(route.params.id), String(route.query.baseline ?? ''), signal), key);
const category = ref<'added' | 'persistent' | 'resolved'>('added');
watch(key, () => { category.value = 'added'; });
const issues = computed(() => !data.value ? [] : category.value === 'persistent' ? data.value.persistent.map(item => item.target) : data.value[category.value]);
const categories = [{ key: 'added', label: 'Nouveaux' }, { key: 'persistent', label: 'Persistants' }, { key: 'resolved', label: 'Résolus' }] as const;
const signed = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
</script>
<template>
  <section>
    <RouterLink
      :to="`/analyses/${route.params.id}`"
      class="back-link"
    ><AppIcon
      name="back"
      :size="16"
    />Retour à l’analyse cible</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Évolution des diagnostics
        </p><h1>Comparaison des analyses</h1><p class="page-description">
          Ce qui apparaît, ce qui persiste et ce qui ne figure plus dans le rapport cible.
        </p>
      </div><button
        class="button-secondary"
        :disabled="loading"
        @click="reload"
      >
        <AppIcon
          name="refresh"
          :size="16"
        />Actualiser
      </button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !loading && !error">
      <div class="mb-6 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        <div class="panel min-w-0">
          <p class="eyebrow">
            Référence
          </p><RouterLink
            :to="`/analyses/${data.baseline.id}`"
            class="text-link"
          >{{ date(data.baseline.createdAt) }}<AppIcon
            name="arrow"
            :size="15"
          /></RouterLink><p class="mt-2 break-all font-mono text-[10px] text-slate-500">
            {{ data.baseline.id }}
          </p><p class="mt-3 text-xs text-slate-600">
            {{ number(data.baseline.statistics!.errorCount) }} erreurs · {{ number(data.baseline.statistics!.warningCount) }} avertissements
          </p>
        </div>
        <RouterLink
          class="button-secondary self-center"
          :to="{ name: 'analysis-comparison', params: { id: data.baseline.id }, query: { baseline: data.target.id } }"
        >Inverser<AppIcon
          name="refresh"
          :size="15"
        /></RouterLink>
        <div class="panel min-w-0">
          <p class="eyebrow">
            Cible
          </p><RouterLink
            :to="`/analyses/${data.target.id}`"
            class="text-link"
          >{{ date(data.target.createdAt) }}<AppIcon
            name="arrow"
            :size="15"
          /></RouterLink><p class="mt-2 break-all font-mono text-[10px] text-slate-500">
            {{ data.target.id }}
          </p><p class="mt-3 text-xs text-slate-600">
            {{ number(data.target.statistics!.errorCount) }} erreurs · {{ number(data.target.statistics!.warningCount) }} avertissements
          </p>
        </div>
      </div>
      <dl class="metrics-strip">
        <MetricCard
          label="Nouveaux problèmes"
          :value="data.counts.added"
          tone="error"
        /><MetricCard
          label="Problèmes persistants"
          :value="data.counts.persistent"
        /><MetricCard
          label="Problèmes résolus"
          :value="data.counts.resolved"
          tone="success"
        /><MetricCard
          label="Positions modifiées"
          :value="data.counts.moved"
          description="Parmi les problèmes persistants"
        />
      </dl>
      <p class="mt-4 text-xs leading-6 text-slate-600">
        Écart cible − référence : {{ signed(data.deltas.errorCount) }} erreurs · {{ signed(data.deltas.warningCount) }} avertissements · {{ signed(data.deltas.analyzedFileCount) }} fichiers analysés · {{ signed(data.deltas.affectedFileCount) }} fichiers concernés.
      </p>
      <p class="notice notice-info mt-6">
        Le rapprochement utilise le fichier, la règle, la gravité, le type et le message. Les décalages de position sont tolérés. « Résolu » signifie absent du rapport cible, sans preuve qu’une correction a été apportée.
      </p>
      <details
        v-if="data.coverage.newlyAnalyzedFiles.length || data.coverage.noLongerAnalyzedFiles.length"
        class="panel mb-6 text-sm"
      >
        <summary class="cursor-pointer font-semibold">
          Le périmètre des fichiers analysés a changé
        </summary><p class="mt-3 text-xs text-slate-600">
          Un fichier peut avoir été ajouté, supprimé ou ignoré. Cela peut expliquer des diagnostics nouveaux ou absents.
        </p><div class="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <h2 class="mb-2 text-xs font-semibold">
              Nouvellement analysés ({{ data.coverage.newlyAnalyzedFiles.length }})
            </h2><ul class="space-y-1">
              <li
                v-for="file in data.coverage.newlyAnalyzedFiles"
                :key="file"
                class="break-all font-mono text-xs"
              >
                {{ file }}
              </li>
            </ul>
          </div><div>
            <h2 class="mb-2 text-xs font-semibold">
              Plus analysés ({{ data.coverage.noLongerAnalyzedFiles.length }})
            </h2><ul class="space-y-1">
              <li
                v-for="file in data.coverage.noLongerAnalyzedFiles"
                :key="file"
                class="break-all font-mono text-xs"
              >
                {{ file }}
              </li>
            </ul>
          </div>
        </div>
      </details>
      <div
        class="mt-8 flex flex-wrap gap-2"
        role="group"
        aria-label="Catégorie de diagnostics"
      >
        <button
          v-for="item in categories"
          :key="item.key"
          :class="category === item.key ? 'button-primary' : 'button-secondary'"
          :aria-pressed="category === item.key"
          @click="category = item.key"
        >
          {{ item.label }} ({{ number(data.counts[item.key]) }})
        </button>
      </div>
      <p
        v-if="category === 'resolved'"
        class="mt-3 text-xs text-slate-500"
      >
        Fichiers et positions du rapport de référence.
      </p><p
        v-else
        class="mt-3 text-xs text-slate-500"
      >
        Fichiers et positions du rapport cible.
      </p>
      <IssuesTable
        :key="`${key()}:${category}`"
        :issues="issues"
        :analysis-id="category === 'resolved' ? data.baseline.id : data.target.id"
        :can-manage-context="category === 'resolved' ? data.baseline.permissions.write : data.target.permissions.write"
        empty-title="Aucun problème dans cette catégorie."
        empty-description="Choisissez une autre catégorie pour consulter les autres diagnostics de cette comparaison."
      />
      <RouterLink
        :to="`/projects/${data.target.projectId}`"
        class="text-link mt-6"
      >Revenir à l’historique du projet<AppIcon
        name="arrow"
        :size="16"
      /></RouterLink>
    </template>
  </section>
</template>
