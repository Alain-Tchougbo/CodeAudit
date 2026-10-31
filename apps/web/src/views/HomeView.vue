<script setup lang="ts">
import { computed } from 'vue';
import { analysesApi } from '../api/analyses';
import { useResource } from '../composables/useResource';
import AnalysisList from '../components/AnalysisList.vue';
import MetricCard from '../components/MetricCard.vue';
import ResourceState from '../components/ResourceState.vue';
import EmptyState from '../components/EmptyState.vue';
import AppIcon from '../components/AppIcon.vue';
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
        </p><h1>Tableau de bord</h1><p class="page-description">
          Une vue claire sur vos projets et la qualité de votre code.
        </p>
      </div><div class="flex flex-wrap gap-3">
        <button
          class="button-secondary"
          :disabled="loading"
          @click="reload"
        >
          <AppIcon
            name="refresh"
            :size="16"
          />Actualiser
        </button><RouterLink
          class="button-primary"
          to="/projects/new"
        ><AppIcon
          name="plus"
          :size="17"
        />Nouveau projet</RouterLink>
      </div>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !loading && !error">
      <dl class="metrics-strip">
        <MetricCard
          label="Projets"
          :value="data.projectCount"
          description="Dans votre espace personnel"
        />
        <MetricCard
          label="Analyses réalisées"
          :value="data.completedCount"
          description="Terminées ou en échec technique"
        />
        <MetricCard
          label="Analyses terminées"
          :value="data.succeededCount"
          description="Avec un rapport disponible"
          tone="success"
        />
        <MetricCard
          label="Échecs techniques"
          :value="data.failedCount"
          description="Traitement non abouti"
          :tone="data.failedCount ? 'error' : 'default'"
        />
      </dl>
      <div class="my-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        <span class="font-medium">{{ number(data.analysisCount) }} analyses au total</span><span class="flex items-center gap-2"><span
          class="size-1.5 rounded-full bg-slate-400"
          aria-hidden="true"
        />{{ number(data.queuedCount) }} en attente</span><span class="flex items-center gap-2"><span
          class="size-1.5 rounded-full bg-blue-500"
          aria-hidden="true"
        />{{ number(data.runningCount) }} en cours</span>
      </div>
      <div class="mt-9 grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          class="min-w-0"
          aria-labelledby="recent-title"
        >
          <div class="section-heading">
            <h2 id="recent-title">
              Dernières analyses
            </h2><RouterLink
              class="text-link text-xs"
              to="/projects"
            >Consulter les projets<AppIcon
              name="arrow"
              :size="15"
            /></RouterLink>
          </div>
          <div class="table-surface">
            <div
              v-if="data.latestAnalyses.length"
              class="flex justify-between border-b border-[#dfe5df] bg-[#f9faf7] px-5 py-3 font-mono text-[10px] tracking-wider text-slate-500"
            >
              <span>PROJET / ANALYSE</span><span>RÉSULTAT</span>
            </div>
            <AnalysisList
              v-if="data.latestAnalyses.length"
              :analyses="data.latestAnalyses"
            />
            <EmptyState
              v-else
              title="Aucune analyse pour le moment"
              description="Ajoutez un projet, importez ses sources et lancez votre première analyse."
              icon="file"
            >
              <RouterLink
                class="button-primary"
                to="/projects"
              >Consulter les projets<AppIcon
                name="arrow"
                :size="16"
              /></RouterLink>
            </EmptyState>
          </div>
        </section>
        <section
          class="panel"
          aria-labelledby="severity-title"
        >
          <div class="mb-6 flex items-start justify-between gap-3">
            <h2
              id="severity-title"
              class="text-base font-semibold"
            >
              Répartition par gravité
            </h2><AppIcon
              name="filter"
              :size="18"
            />
          </div>
          <p class="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            Diagnostics cumulés
          </p>
          <p class="mt-2 text-4xl font-semibold tracking-tight">
            {{ number(diagnostics) }}
          </p>
          <div
            v-if="diagnostics"
            class="my-6 flex h-2 overflow-hidden rounded-full bg-slate-100"
            aria-hidden="true"
          >
            <div
              class="bg-[#c25749]"
              :style="{ width: `${data.errorCount / diagnostics * 100}%` }"
            /><div
              class="bg-[#ddb65c]"
              :style="{ width: `${data.warningCount / diagnostics * 100}%` }"
            />
          </div>
          <dl class="mt-6 space-y-4">
            <div class="flex items-center justify-between border-b border-[#edf0ea] pb-4">
              <dt class="flex items-center gap-2 text-sm text-slate-600">
                <span
                  class="size-2 rounded-sm bg-[#c25749]"
                  aria-hidden="true"
                />Erreurs
              </dt><dd class="font-mono text-sm font-semibold text-[#aa342c]">
                {{ number(data.errorCount) }}
              </dd>
            </div><div class="flex items-center justify-between">
              <dt class="flex items-center gap-2 text-sm text-slate-600">
                <span
                  class="size-2 rounded-sm bg-[#ddb65c]"
                  aria-hidden="true"
                />Avertissements
              </dt><dd class="font-mono text-sm font-semibold text-[#85591b]">
                {{ number(data.warningCount) }}
              </dd>
            </div>
          </dl>
          <p
            v-if="!diagnostics"
            class="mt-6 text-xs text-slate-600"
          >
            {{ data.succeededCount ? 'Aucun problème détecté dans les analyses réussies.' : 'Aucun rapport disponible pour calculer la répartition.' }}
          </p>
          <p class="mt-6 border-t border-[#edf0ea] pt-4 text-xs leading-6 text-slate-500">
            Toutes les analyses réussies de l’historique sont incluses, même les analyses répétées d’un projet.
          </p>
        </section>
      </div>
    </template>
  </section>
</template>
