<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import EmptyState from './EmptyState.vue';
import { ref, watch } from 'vue';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import AnalysisList from './AnalysisList.vue';
import ResourceState from './ResourceState.vue';
const props = defineProps<{ projectId: string }>();
const cursor = ref<string>();
const previous = ref<(string | undefined)[]>([]);
watch(() => props.projectId, () => { cursor.value = undefined; previous.value = []; });
const { data, loading, error, reload } = useResource((signal) => analysesApi.history(props.projectId, cursor.value, signal), () => `${props.projectId}:${cursor.value ?? ''}`);
function next() { if (data.value?.nextCursor) { previous.value.push(cursor.value); cursor.value = data.value.nextCursor; } }
function back() { cursor.value = previous.value.pop(); }
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
          </div><AnalysisList :analyses="data.items" />
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
