<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAnalysisDetail } from '../composables/useAnalysisDetail';
import AnalysisStatus from '../components/AnalysisStatus.vue';
import IssuesTable from '../components/IssuesTable.vue';
import MetricCard from '../components/MetricCard.vue';
import ResourceState from '../components/ResourceState.vue';
import { date, duration, number } from '../format';
const route = useRoute();
const { data, loading, error, reload, now } = useAnalysisDetail(() => String(route.params.id));
const elapsed = computed(() => {
  const analysis = data.value?.analysis;
  return analysis?.startedAt ? duration((analysis.finishedAt ? Date.parse(analysis.finishedAt) : now.value) - Date.parse(analysis.startedAt)) : 'Pas encore démarrée';
});
</script>
<template>
  <section>
    <RouterLink
      to="/"
      class="text-sm font-medium text-indigo-700 underline"
    >Retour au tableau de bord</RouterLink>
    <div class="page-heading mt-6">
      <div>
        <p class="eyebrow">
          Rapport d’audit
        </p><h1>Détail de l’analyse</h1>
      </div><button
        class="button-secondary"
        :disabled="loading"
        @click="reload"
      >
        Actualiser
      </button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !error">
      <div class="panel mb-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <AnalysisStatus :status="data.analysis.status" /><RouterLink
            :to="`/projects/${data.analysis.projectId}`"
            class="text-sm font-semibold text-indigo-700 underline"
          >Voir le projet et son historique</RouterLink>
        </div>
        <p class="mt-5 break-all font-mono text-xs text-slate-500">
          {{ data.analysis.id }}
        </p>
        <dl class="mt-5 grid gap-5 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-slate-500">
              Demandée le
            </dt><dd class="mt-1 font-medium">
              {{ date(data.analysis.createdAt) }}
            </dd>
          </div><div>
            <dt class="text-slate-500">
              Durée du traitement{{ data.analysis.status === 'RUNNING' ? ' (écoulée)' : '' }}
            </dt><dd class="mt-1 font-medium">
              {{ elapsed }}
            </dd>
          </div><div>
            <dt class="text-slate-500">
              Profil de règles
            </dt><dd class="mt-1 break-words font-medium">
              {{ data.analysis.profileVersion ?? 'Disponible après analyse' }}
            </dd>
          </div>
        </dl>
        <p
          v-if="data.analysis.finishedAt"
          class="mt-4 text-sm text-slate-500"
        >
          Traitement terminé le {{ date(data.analysis.finishedAt) }}.
        </p>
      </div>
      <p
        v-if="data.analysis.status === 'QUEUED' || data.analysis.status === 'RUNNING'"
        role="status"
        class="panel border-blue-200 bg-blue-50 text-blue-900"
      >
        {{ data.analysis.status === 'QUEUED' ? 'Cette analyse attend un worker disponible.' : 'Analyse en cours. Les résultats seront disponibles à la fin du traitement.' }} Mise à jour automatique toutes les 3 secondes.
      </p>
      <div
        v-else-if="data.analysis.status === 'FAILED'"
        role="alert"
        class="panel border-red-200 bg-red-50 text-red-900"
      >
        <h2 class="font-semibold">
          Le traitement n’a pas abouti
        </h2><p class="mt-2">
          {{ data.analysis.error?.message ?? 'Une erreur technique a empêché la production du rapport.' }}
        </p><p
          v-if="data.analysis.error"
          class="mt-3 font-mono text-xs"
        >
          {{ data.analysis.error.code }}
        </p><p class="mt-3 text-sm">
          Aucun résultat de code n’est disponible. Une nouvelle tentative nécessite un nouvel import.
        </p>
      </div>
      <template v-if="data.report">
        <dl class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="Fichiers analysés"
            :value="data.report.statistics.analyzedFileCount"
          /><MetricCard
            label="Fichiers concernés"
            :value="data.report.statistics.affectedFileCount"
          /><MetricCard
            label="Erreurs"
            :value="data.report.statistics.errorCount"
          /><MetricCard
            label="Avertissements"
            :value="data.report.statistics.warningCount"
          />
        </dl>
        <p class="mt-4 text-sm text-slate-600">
          Durée du moteur : {{ duration(data.report.statistics.durationMs) }} · {{ number(data.report.statistics.ignoredEntryCount) }} entrées ignorées · {{ number(data.report.statistics.syntaxErrorCount) }} erreurs de syntaxe incluses dans les erreurs.
        </p>
        <IssuesTable
          :key="data.analysis.id"
          :issues="data.report.issues"
        />
      </template>
    </template>
  </section>
</template>
