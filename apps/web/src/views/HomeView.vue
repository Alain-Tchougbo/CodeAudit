<script setup lang="ts">
import { computed } from 'vue';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import AnalysisList from '../components/AnalysisList.vue';
import MetricCard from '../components/MetricCard.vue';
import ResourceState from '../components/ResourceState.vue';
import { number } from '../format';
const { data, loading, error, reload } = useResource((signal) => analysesApi.dashboard(signal));
const diagnostics = computed(() => (data.value?.errorCount ?? 0) + (data.value?.warningCount ?? 0));
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Vue d’ensemble
        </p><h1>Tableau de bord</h1><p class="mt-2 text-slate-600">
          Suivez vos projets et les résultats de vos analyses.
        </p>
      </div>
      <button
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
    <template v-if="data && !loading && !error">
      <dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Projets"
          :value="data.projectCount"
          description="Projets enregistrés"
        />
        <MetricCard
          label="Analyses réalisées"
          :value="data.completedCount"
          description="Terminées ou en échec technique"
        />
        <MetricCard
          label="Analyses terminées"
          :value="data.succeededCount"
          description="Rapport disponible, avec ou sans problème"
        />
        <MetricCard
          label="Échecs techniques"
          :value="data.failedCount"
          description="Traitement non abouti"
        />
      </dl>
      <p class="mt-4 text-sm text-slate-600">
        {{ number(data.analysisCount) }} analyses au total · {{ number(data.queuedCount) }} en attente · {{ number(data.runningCount) }} en cours
      </p>
      <section
        class="panel my-8"
        aria-labelledby="severity-title"
      >
        <h2
          id="severity-title"
          class="text-lg font-semibold"
        >
          Répartition par gravité
        </h2>
        <p class="mt-1 text-sm text-slate-500">
          Diagnostics cumulés de toutes les analyses réussies de l’historique, y compris les analyses répétées d’un projet.
        </p>
        <div
          v-if="diagnostics"
          class="my-6 flex h-3 overflow-hidden rounded-full bg-slate-100"
          aria-hidden="true"
        >
          <div
            class="bg-red-500"
            :style="{ width: `${data.errorCount / diagnostics * 100}%` }"
          />
          <div
            class="bg-amber-400"
            :style="{ width: `${data.warningCount / diagnostics * 100}%` }"
          />
        </div>
        <dl class="mt-5 grid gap-4 sm:grid-cols-2">
          <div class="rounded-lg bg-red-50 p-4">
            <dt class="text-sm text-red-800">
              Erreurs
            </dt><dd class="mt-1 text-2xl font-semibold text-red-950">
              {{ number(data.errorCount) }}
            </dd>
          </div>
          <div class="rounded-lg bg-amber-50 p-4">
            <dt class="text-sm text-amber-900">
              Avertissements
            </dt><dd class="mt-1 text-2xl font-semibold text-amber-950">
              {{ number(data.warningCount) }}
            </dd>
          </div>
        </dl>
        <p
          v-if="!diagnostics"
          class="mt-4 text-sm text-slate-600"
        >
          {{ data.succeededCount ? 'Aucun problème détecté dans les analyses réussies.' : 'Aucun rapport disponible pour calculer la répartition.' }}
        </p>
      </section>
      <section aria-labelledby="recent-title">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="recent-title"
            class="text-xl font-semibold"
          >
            Dernières analyses
          </h2><RouterLink
            class="text-sm font-semibold text-indigo-700 underline"
            to="/projects"
          >Consulter les projets</RouterLink>
        </div>
        <div
          v-if="data.latestAnalyses.length"
          class="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <AnalysisList :analyses="data.latestAnalyses" />
        </div>
        <div
          v-else
          class="panel py-10 text-center"
        >
          <h3 class="font-semibold">
            Aucune analyse pour le moment
          </h3><p class="mt-2 text-slate-600">
            Les analyses demandées via l’API apparaîtront ici.
          </p><RouterLink
            class="button-primary mt-5 inline-block"
            to="/projects"
          >Consulter les projets</RouterLink>
        </div>
      </section>
    </template>
  </section>
</template>
