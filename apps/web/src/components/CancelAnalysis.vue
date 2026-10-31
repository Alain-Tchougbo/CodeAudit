<script setup lang="ts">
import { nextTick, onScopeDispose, ref, watch } from 'vue';
import type { AnalysisSummary } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';
const props = defineProps<{ analysis: AnalysisSummary }>();
const emit = defineEmits<{ updated: [] }>();
const confirming = ref(false); const busy = ref(false); const error = ref('');
const trigger = ref<HTMLButtonElement>(); const back = ref<HTMLButtonElement>(); const controller = new AbortController();
onScopeDispose(() => controller.abort());
watch(confirming, async value => { await nextTick(); if (value) back.value?.focus(); else trigger.value?.focus(); });
async function cancel() {
  if (busy.value) return; busy.value = true; error.value = '';
  try { await analysesApi.cancel(props.analysis.id, controller.signal); if (!controller.signal.aborted) { confirming.value = false; emit('updated'); } }
  catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Annulation impossible.'; }
  finally { if (!controller.signal.aborted) busy.value = false; }
}
</script>
<template>
  <div
    v-if="analysis.status === 'QUEUED' || analysis.status === 'RUNNING'"
    class="mb-6"
  >
    <p
      v-if="analysis.cancelRequestedAt"
      role="status"
      class="notice notice-info"
    >
      Annulation demandée. Le worker doit arrêter le moteur avant de confirmer l’annulation. Aucun nouveau rapport ne sera publié.
    </p>
    <button
      v-else
      ref="trigger"
      class="button-secondary"
      :disabled="busy"
      :aria-expanded="confirming"
      @click="confirming = true"
    >
      Annuler l’analyse
    </button>
    <section
      v-if="confirming && !analysis.cancelRequestedAt"
      class="notice notice-warning block mt-4"
      aria-label="Confirmer l’annulation"
      @keydown.esc="confirming = false"
    >
      <p class="font-semibold">
        Arrêter cette analyse ?
      </p><p class="mt-2 text-sm">
        Aucun rapport partiel ne sera conservé. Une nouvelle analyse nécessitera un nouvel import.
      </p>
      <div class="mt-4 flex flex-wrap gap-3">
        <button
          class="button-danger"
          :disabled="busy"
          @click="cancel"
        >
          {{ busy ? 'Demande en cours…' : 'Confirmer l’annulation' }}
        </button>
        <button
          ref="back"
          class="button-secondary"
          :disabled="busy"
          @click="confirming = false"
        >
          Poursuivre l’analyse
        </button>
      </div>
    </section>
    <p
      v-if="error"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ error }}
    </p>
  </div>
</template>
