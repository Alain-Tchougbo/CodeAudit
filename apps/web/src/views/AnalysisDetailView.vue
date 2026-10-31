<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
import AnalysisProgress from '../components/AnalysisProgress.vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAnalysisDetail } from '../composables/useAnalysisDetail';
import AnalysisStatus from '../components/AnalysisStatus.vue';
import IssuesTable from '../components/IssuesTable.vue';
import MetricCard from '../components/MetricCard.vue';
import ResourceState from '../components/ResourceState.vue';
import ReportExport from '../components/ReportExport.vue';
import CancelAnalysis from '../components/CancelAnalysis.vue';
import QualityGateResult from '../components/QualityGateResult.vue';
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
      class="back-link"
    ><AppIcon
      name="back"
      :size="16"
    />Retour au tableau de bord</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Rapport d’audit
        </p><h1>Détail de l’analyse</h1><p class="page-description">
          Les résultats d’une exécution, conservés dans le temps.
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
    <template v-if="data && !error">
      <section
        class="panel mb-6"
        aria-label="Informations de l’analyse"
      >
        <div class="flex flex-wrap items-start justify-between gap-5">
          <div class="min-w-0">
            <p class="mb-2 font-mono text-[10px] tracking-wider text-slate-500">
              PROJET ANALYSÉ
            </p><h2 class="break-words text-lg font-semibold">
              {{ data.analysis.projectSnapshot?.name || 'Analyse du projet' }}
            </h2><p
              v-if="data.analysis.projectSnapshot?.description"
              class="mt-2 max-w-2xl whitespace-pre-wrap break-words text-sm text-slate-600"
            >
              {{ data.analysis.projectSnapshot.description || 'Aucune description.' }}
            </p>
          </div><AnalysisStatus :status="data.analysis.status" />
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
          <RouterLink
            :to="`/projects/${data.analysis.projectId}`"
            class="text-link text-xs"
          >Voir le projet et son historique<AppIcon
            name="arrow"
            :size="15"
          /></RouterLink>
        </div>
        <dl class="mt-4 grid grid-cols-2 gap-5 border-t border-[#e4e9df] pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="text-xs text-slate-500">
              Demandée le
            </dt><dd class="mt-2 font-medium">
              {{ date(data.analysis.createdAt) }}
            </dd>
          </div><div>
            <dt class="text-xs text-slate-500">
              Durée du traitement{{ data.analysis.status === 'RUNNING' ? ' (écoulée)' : '' }}
            </dt><dd class="mt-2 flex items-center gap-2 font-medium">
              <AppIcon
                name="clock"
                :size="15"
                class="text-slate-500"
              />{{ elapsed }}
            </dd>
          </div><div class="col-span-2 sm:col-span-1">
            <dt class="text-xs text-slate-500">
              Profil de règles
            </dt><dd class="mt-2 break-words font-mono text-xs text-[#496351]">
              {{ data.analysis.profileVersion ?? 'Disponible après analyse' }}
            </dd>
          </div>
        </dl>
        <AnalysisProgress :status="data.analysis.status" />
        <dl
          v-if="data.analysis.source"
          class="mt-5 border-t border-[#e4e9df] pt-4 text-xs"
        >
          <dt class="font-semibold">
            Provenance GitHub
          </dt><dd class="mt-2 break-words">
            {{ data.analysis.source.repository }} · {{ data.analysis.source.requestedRef }}
          </dd>
          <dt class="mt-3 text-slate-500">
            Commit enregistré
          </dt><dd class="mt-1 break-all font-mono">
            {{ data.analysis.source.commitSha }}
          </dd>
          <dd
            v-if="data.analysis.source.archiveRepository !== data.analysis.source.repository"
            class="mt-2 break-words text-slate-500"
          >
            Sources du fork {{ data.analysis.source.archiveRepository }}
          </dd>
        </dl>
        <p
          v-if="data.analysis.status === 'RUNNING' && data.analysis.heartbeatAt"
          class="mt-4 text-xs text-slate-500"
        >
          Dernier signal du worker : {{ date(data.analysis.heartbeatAt) }}<span v-if="data.analysis.deadlineAt"> · Échéance du traitement : {{ date(data.analysis.deadlineAt) }}</span>
        </p>
        <details class="mt-5 border-t border-[#e4e9df] pt-4 text-xs text-slate-500">
          <summary class="min-h-7 cursor-pointer font-medium text-indigo-700">
            Informations techniques et provenance
          </summary>
          <p class="mt-3 break-all font-mono text-[10px]">
            ID / {{ data.analysis.id }}
          </p>
          <p
            v-if="data.analysis.finishedAt"
            class="mt-3"
          >
            Traitement terminé le {{ date(data.analysis.finishedAt) }}.
          </p>
          <p
            v-if="data.analysis.projectSnapshot"
            class="mt-3"
          >
            {{ data.analysis.projectSnapshot.origin === 'MIGRATION_BACKFILL' ? 'Informations du projet reprises lors de la migration historique.' : 'Informations du projet figées à la demande de cette analyse.' }}
          </p>
        </details>
      </section>
      <p
        v-if="data.analysis.status === 'QUEUED' || data.analysis.status === 'RUNNING'"
        role="status"
        class="notice notice-info"
      >
        <span
          class="spinner mt-0.5 shrink-0"
          aria-hidden="true"
        /><span>{{ data.analysis.status === 'QUEUED' ? 'Cette analyse attend un worker disponible.' : 'Analyse en cours. Les résultats seront disponibles à la fin du traitement.' }} Mise à jour automatique toutes les 3 secondes.</span>
      </p>
      <div
        v-else-if="data.analysis.status === 'FAILED'"
        role="alert"
        class="notice notice-error block p-5"
      >
        <h2 class="flex items-center gap-2 font-semibold">
          <AppIcon
            name="warning"
            :size="18"
          />Le traitement n’a pas abouti
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
      <p
        v-else-if="data.analysis.status === 'CANCELLED'"
        role="status"
        class="notice notice-info"
      >
        Analyse annulée. Aucun rapport n’a été publié. Les rapports des autres analyses sont conservés.
      </p>
      <CancelAnalysis
        :key="data.analysis.id"
        :analysis="data.analysis"
        @updated="reload"
      />
      <template v-if="data.report">
        <dl class="metrics-strip">
          <MetricCard
            label="Fichiers analysés"
            :value="data.report.statistics.analyzedFileCount"
          /><MetricCard
            label="Fichiers concernés"
            :value="data.report.statistics.affectedFileCount"
          /><MetricCard
            label="Erreurs"
            :value="data.report.statistics.errorCount"
            tone="error"
          /><MetricCard
            label="Avertissements"
            :value="data.report.statistics.warningCount"
            tone="warning"
          />
        </dl>
        <p class="mt-4 text-xs leading-6 text-slate-600">
          Durée du moteur : {{ duration(data.report.statistics.durationMs) }} · {{ number(data.report.statistics.ignoredEntryCount) }} entrées ignorées · {{ number(data.report.statistics.syntaxErrorCount) }} erreurs de syntaxe incluses dans les erreurs.
        </p>
      </template>
      <ReportExport
        :key="data.analysis.id"
        :analysis-id="data.analysis.id"
        :status="data.analysis.status"
      />
      <QualityGateResult
        :key="`gate-${data.analysis.id}`"
        :analysis-id="data.analysis.id"
        :status="data.analysis.status"
      />
      <IssuesTable
        v-if="data.report"
        :key="data.analysis.id"
        :issues="data.report.issues"
        :analysis-id="data.analysis.id"
      />
    </template>
  </section>
</template>
