<script setup lang="ts">
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
    class="mt-10 border-t border-slate-200 pt-8"
    aria-labelledby="history-title"
  >
    <div class="mb-5 flex items-center justify-between gap-3">
      <h2
        id="history-title"
        class="text-xl font-semibold"
      >
        Historique des analyses
      </h2>
      <button
        class="button-secondary"
        :disabled="loading"
        @click="reload"
      >
        Actualiser l’historique
      </button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !loading && !error">
      <p
        v-if="!data.items.length"
        class="panel text-slate-600"
      >
        Aucune analyse pour ce projet.
      </p>
      <div
        v-else
        class="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        <AnalysisList :analyses="data.items" />
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
          Précédent
        </button>
        <span class="text-sm text-slate-600">Page {{ previous.length + 1 }}</span>
        <button
          class="button-secondary"
          :disabled="!data.nextCursor"
          @click="next"
        >
          Suivant
        </button>
      </nav>
    </template>
  </section>
</template>
