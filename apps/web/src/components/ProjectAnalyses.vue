<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import EmptyState from './EmptyState.vue';
import { computed, ref, watch } from 'vue';
import type { AnalysisSummary } from '@codeaudit/contracts';
import { date } from '../format';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import AnalysisList from './AnalysisList.vue';
import ResourceState from './ResourceState.vue';
const props = defineProps<{ projectId: string }>();
const cursor = ref<string>();
const previous = ref<(string | undefined)[]>([]);
const selected = ref<AnalysisSummary[]>([]);
const ordered = computed(() => [...selected.value].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)));
watch(() => props.projectId, () => { cursor.value = undefined; previous.value = []; selected.value = []; });
const { data, loading, error, reload } = useResource((signal) => analysesApi.history(props.projectId, cursor.value, signal), () => `${props.projectId}:${cursor.value ?? ''}`);
function next() { if (data.value?.nextCursor) { previous.value.push(cursor.value); cursor.value = data.value.nextCursor; } }
function back() { cursor.value = previous.value.pop(); }
function toggle(analysis: AnalysisSummary) {
  if (selected.value.some(item => item.id === analysis.id)) selected.value = selected.value.filter(item => item.id !== analysis.id);
  else if (analysis.status === 'SUCCEEDED' && selected.value.length < 2) selected.value.push(analysis);
}
</script>
<template>
  <section
    class="mt-10"
    aria-labelledby="history-title"
  >
    <div class="section-heading">
      <div>
        <h2 id="history-title">
          Historique des analyses
        </h2><p class="mt-2 text-xs text-slate-500">
          Retrouvez chaque exécution et les résultats qui lui sont propres.
        </p>
      </div><button
        class="button-secondary"
        :disabled="loading"
        @click="reload"
      >
        <AppIcon
          name="refresh"
          :size="16"
        />Actualiser l’historique
      </button>
    </div>
    <div
      v-if="selected.length || (data?.items.length && !error)"
      class="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#dfe5df] bg-[#f0f4ed] p-4"
    >
      <div>
        <p class="text-sm font-medium">
          Comparer deux analyses terminées <span class="ml-2 font-mono text-xs text-slate-500">{{ selected.length }} / 2</span>
        </p><p class="mt-1 text-xs text-slate-600">
          Cochez les analyses dans l’historique, y compris sur des pages différentes.
        </p><p
          v-if="ordered.length"
          class="mt-2 text-xs text-slate-600"
        >
          Référence : {{ date(ordered[0]!.createdAt) }} · #{{ ordered[0]!.id.slice(0, 8) }}<template v-if="ordered[1]">
            → Cible : {{ date(ordered[1].createdAt) }} · #{{ ordered[1].id.slice(0, 8) }}
          </template>
        </p>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          v-if="selected.length"
          class="button-secondary"
          @click="selected = []"
        >
          Effacer la sélection
        </button><RouterLink
          v-if="ordered.length === 2"
          class="button-primary"
          :to="{ name: 'analysis-comparison', params: { id: ordered[1]!.id }, query: { baseline: ordered[0]!.id } }"
        >Comparer les analyses<AppIcon
          name="arrow"
          :size="16"
        /></RouterLink><button
          v-else
          class="button-primary"
          disabled
        >
          Comparer les analyses
        </button>
      </div>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !loading && !error">
      <div class="table-surface">
        <EmptyState
          v-if="!data.items.length"
          icon="file"
          title="Aucune analyse pour ce projet."
          description="Importez une archive ci-dessus pour démarrer. Chaque analyse apparaîtra ici avec son état et sa durée."
        /><template v-else>
          <div class="flex justify-between border-b border-[#dfe5df] bg-[#f9faf7] px-5 py-3 font-mono text-[10px] tracking-wider text-slate-500">
            <span>ANALYSE / DATE</span><span>RÉSULTAT / ÉTAT</span>
          </div><AnalysisList
            :analyses="data.items"
            selectable
            :selected-ids="selected.map(item => item.id)"
            @toggle="toggle"
          />
        </template>
      </div>
      <nav
        v-if="previous.length || data.nextCursor"
        class="mt-4 flex items-center justify-between gap-4"
        aria-label="Pagination de l’historique"
      >
        <button
          class="button-secondary"
          :disabled="!previous.length"
          @click="back"
        >
          <AppIcon
            name="back"
            :size="15"
          />Précédent
        </button><span class="text-xs text-slate-600">Page {{ previous.length + 1 }}</span><button
          class="button-secondary"
          :disabled="!data.nextCursor"
          @click="next"
        >
          Suivant<AppIcon
            name="arrow"
            :size="15"
          />
        </button>
      </nav>
    </template>
  </section>
</template>
