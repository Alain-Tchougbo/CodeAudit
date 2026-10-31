<script setup lang="ts">
import type { AnalysisStatus } from '@codeaudit/contracts';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
const props = defineProps<{ analysisId: string; status: AnalysisStatus }>();
const { data, loading, error, reload } = useResource(signal => analysesApi.gate(props.analysisId, signal), () => `${props.analysisId}:${props.status}`);
const labels = { PASS: 'Seuils respectés', FAIL: 'Seuils dépassés', PENDING: 'Évaluation après traitement', UNAVAILABLE: 'Décision qualité indisponible', NOT_CONFIGURED: 'Aucun seuil actif pour cette analyse' };
</script>
<template>
  <section
    class="mt-6"
    aria-label="Décision qualité"
  >
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <div
      v-if="data && !loading && !error"
      class="notice block"
      :class="data.status === 'PASS' ? 'notice-success' : data.status === 'FAIL' ? 'notice-warning' : 'notice-info'"
    >
      <h2 class="font-semibold">
        {{ labels[data.status] }}
      </h2>
      <ul
        v-if="data.criteria.length"
        class="mt-3 space-y-1 text-sm"
      >
        <li
          v-for="criterion in data.criteria"
          :key="criterion.metric"
        >
          {{ criterion.metric === 'errorCount' ? 'Erreurs' : 'Avertissements' }} : {{ criterion.value }} / {{ criterion.maximum }} autorisés · {{ criterion.passed ? 'Respecté' : 'Dépassé' }}
        </li>
      </ul>
      <p
        v-if="data.status === 'NOT_CONFIGURED'"
        class="mt-2 text-sm"
      >
        Les seuils ajoutés plus tard ne sont pas appliqués rétroactivement.
      </p>
      <p
        v-if="data.status === 'FAIL'"
        class="mt-2 text-sm"
      >
        Le rapport reste disponible. Cette décision utilise les compteurs enregistrés et les seuils figés à la demande.
      </p>
    </div>
  </section>
</template>
