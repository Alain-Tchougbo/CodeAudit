<script setup lang="ts">
import { useRoute } from 'vue-router';
import { projectsApi } from '../api/projects';
import { useResource } from '../composables/useResource';

const route = useRoute();
const { data: projects, loading, error, reload } = useResource((signal) => projectsApi.list(signal));
</script>

<template>
  <section aria-labelledby="projects-heading">
    <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1
        id="projects-heading"
        class="text-3xl font-bold"
      >
        Projets
      </h1>
      <RouterLink
        to="/projects/new"
        class="rounded bg-slate-900 px-4 py-2 text-white"
      >Ajouter un projet</RouterLink>
    </div>
    <p
      v-if="route.query.deleted === '1'"
      role="status"
      class="mb-5 text-green-800"
    >
      Projet supprimé.
    </p>
    <p
      v-if="loading"
      role="status"
    >
      Chargement des projets…
    </p>
    <div
      v-else-if="error"
      role="alert"
      class="rounded border border-red-200 bg-red-50 p-4"
    >
      <p>{{ error }}</p>
      <button
        class="mt-3 underline"
        @click="reload"
      >
        Réessayer
      </button>
    </div>
    <p
      v-else-if="projects?.length === 0"
      class="rounded border border-slate-200 bg-white p-6"
    >
      Aucun projet pour le moment. Ajoutez votre premier projet.
    </p>
    <ul
      v-else
      class="space-y-4"
    >
      <li
        v-for="project in projects"
        :key="project.id"
        class="rounded border border-slate-200 bg-white p-5"
      >
        <RouterLink
          :to="`/projects/${project.id}`"
          class="text-xl font-semibold underline"
        >{{ project.name }}</RouterLink>
        <p
          v-if="project.description"
          class="mt-2 whitespace-pre-wrap break-words text-slate-700"
        >
          {{ project.description }}
        </p>
        <p class="mt-3 text-sm text-slate-500">
          Créé le {{ new Date(project.createdAt).toLocaleString('fr-FR') }}
        </p>
      </li>
    </ul>
  </section>
</template>
