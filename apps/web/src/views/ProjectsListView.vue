<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { projectsApi } from '../api/projects';
import { useResource } from '../composables/useResource';
import ResourceState from '../components/ResourceState.vue';
import EmptyState from '../components/EmptyState.vue';
import AppIcon from '../components/AppIcon.vue';
import { date } from '../format';
const route = useRoute();
const { data: projects, loading, error, reload } = useResource((signal) => projectsApi.list(signal));
const search = ref('');
const filtered = computed(() => (projects.value ?? []).filter(project => `${project.name} ${project.description ?? ''} ${project.team?.name ?? ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())));
</script>
<template>
  <section aria-labelledby="projects-heading">
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Votre espace de travail
        </p><h1 id="projects-heading">
          Projets
        </h1><p class="page-description">
          Tous vos projets. Un point de départ pour chaque analyse.
        </p>
      </div><RouterLink
        to="/projects/new"
        class="button-primary"
      ><AppIcon
        name="plus"
        :size="17"
      />Ajouter un projet</RouterLink>
    </div>
    <p
      v-if="route.query.deleted === '1'"
      role="status"
      class="notice notice-success"
    >
      <AppIcon
        name="check"
        :size="18"
      />Projet supprimé.
    </p>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <div
      v-if="projects && !loading && !error"
      class="table-surface"
    >
      <div
        v-if="projects.length"
        class="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfe5df] p-4 sm:px-6"
      >
        <span class="text-sm font-semibold">{{ projects.length }} projet{{ projects.length > 1 ? 's' : '' }}<span class="ml-2 font-normal text-slate-500">dans votre espace</span></span><div class="relative w-full sm:w-72">
          <label
            for="project-search"
            class="sr-only"
          >Rechercher un projet</label><AppIcon
            name="search"
            :size="17"
            class="pointer-events-none absolute top-3.5 left-3 text-slate-500"
          /><input
            id="project-search"
            v-model="search"
            type="search"
            class="field pl-10"
            placeholder="Rechercher un projet…"
          >
        </div>
      </div>
      <EmptyState
        v-if="!projects.length"
        title="Aucun projet pour le moment"
        description="Donnez un nom à votre projet. Vous pourrez ensuite importer ses sources et lancer une analyse."
      >
        <RouterLink
          class="button-primary"
          to="/projects/new"
        ><AppIcon
          name="plus"
          :size="16"
        />Créer mon premier projet</RouterLink>
      </EmptyState>
      <EmptyState
        v-else-if="!filtered.length"
        title="Aucun projet ne correspond"
        description="Essayez un autre nom ou recherchez dans la description."
        icon="search"
      >
        <button
          class="button-secondary"
          @click="search = ''"
        >
          Effacer la recherche
        </button>
      </EmptyState>
      <template v-else>
        <div class="hidden grid-cols-[1fr_190px_24px] gap-5 border-b border-[#dfe5df] bg-[#f9faf7] px-6 py-3 font-mono text-[10px] tracking-wider text-slate-500 md:grid">
          <span>NOM DU PROJET</span><span>DERNIÈRE MODIFICATION</span><span />
        </div>
        <ul class="divide-y divide-[#edf0ea]">
          <li
            v-for="project in filtered"
            :key="project.id"
            class="group grid grid-cols-[1fr_20px] items-center gap-5 px-5 py-6 hover:bg-[#fbfcf9] sm:px-6 md:grid-cols-[1fr_190px_24px]"
          >
            <div class="flex min-w-0 items-start gap-4">
              <span class="mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-lg border border-[#dce7dc] bg-[#f2f7ed] text-indigo-700 sm:flex"><AppIcon
                name="folder"
                :size="21"
              /></span><div class="min-w-0">
                <RouterLink
                  :to="`/projects/${project.id}`"
                  class="break-words text-sm font-semibold text-slate-900 underline-offset-4 hover:text-indigo-700 hover:underline"
                >{{ project.name }}</RouterLink><p class="mt-1.5 line-clamp-2 whitespace-pre-wrap break-words text-xs text-slate-500">
                  {{ project.description || 'Aucune description.' }}
                </p><p class="mt-2 text-xs text-slate-600">
                  {{ project.team?.name ?? 'Personnel' }}<span v-if="!project.permissions.write"> · Lecture seule</span>
                </p><p class="mt-3 text-xs text-slate-500 md:hidden">
                  Modifié le {{ date(project.updatedAt) }}
                </p>
              </div>
            </div>
            <p class="hidden text-xs text-slate-500 md:block">
              {{ date(project.updatedAt) }}
            </p><AppIcon
              name="arrow"
              :size="17"
              class="text-slate-400"
            />
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>
