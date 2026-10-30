<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi } from '../api/projects';
import { useResource } from '../composables/useResource';
import ProjectAnalyses from '../components/ProjectAnalyses.vue';
import AnalysisImport from '../components/AnalysisImport.vue';

const route = useRoute();
const router = useRouter();
const { data: project, loading, error, reload } = useResource(
  (signal) => projectsApi.get(String(route.params.id), signal), () => String(route.params.id),
);
const confirming = ref(false);
const deleting = ref(false);
const deleteError = ref('');

async function remove(): Promise<void> {
  if (!project.value || deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await projectsApi.delete(project.value.id);
    await router.push({ path: '/projects', query: { deleted: '1' } });
  } catch (cause) {
    deleteError.value = cause instanceof Error ? cause.message : 'Impossible de supprimer le projet.';
  } finally { deleting.value = false; }
}
</script>

<template>
  <section>
    <RouterLink
      to="/projects"
      class="underline"
    >Retour aux projets</RouterLink>
    <p
      v-if="loading"
      role="status"
      class="mt-6"
    >
      Chargement du projet…
    </p>
    <div
      v-else-if="error"
      role="alert"
      class="mt-6 text-red-700"
    >
      <p>{{ error }}</p>
      <button
        class="mt-3 underline"
        @click="reload"
      >
        Réessayer
      </button>
    </div>
    <div
      v-else-if="project"
      class="mt-6"
    >
      <p
        v-if="route.query.created === '1'"
        role="status"
        class="mb-5 text-green-800"
      >
        Projet créé.
      </p>
      <p
        v-if="route.query.updated === '1'"
        role="status"
        class="mb-5 text-green-800"
      >
        Projet modifié.
      </p>
      <h1 class="break-words text-3xl font-bold">
        {{ project.name }}
      </h1>
      <p class="mt-5 whitespace-pre-wrap break-words">
        {{ project.description || 'Aucune description.' }}
      </p>
      <dl class="my-6 space-y-2 text-sm text-slate-600">
        <div>
          <dt class="inline font-medium">
            Créé le :
          </dt><dd class="inline">
            {{ new Date(project.createdAt).toLocaleString('fr-FR') }}
          </dd>
        </div>
        <div>
          <dt class="inline font-medium">
            Modifié le :
          </dt><dd class="inline">
            {{ new Date(project.updatedAt).toLocaleString('fr-FR') }}
          </dd>
        </div>
      </dl>
      <div class="flex flex-wrap gap-4">
        <RouterLink
          :to="`/projects/${project.id}/edit`"
          class="rounded bg-slate-900 px-4 py-2 text-white"
        >Modifier le projet</RouterLink>
        <button
          :disabled="deleting"
          class="rounded border border-red-300 px-4 py-2 text-red-800"
          @click="confirming = true"
        >
          Supprimer le projet
        </button>
      </div>
      <div
        v-if="confirming"
        class="mt-6 rounded border border-red-200 bg-red-50 p-5"
      >
        <p>Supprimer définitivement ce projet et ses analyses terminées ? Cette action est irréversible.</p>
        <div class="mt-4 flex gap-4">
          <button
            :disabled="deleting"
            class="rounded bg-red-800 px-4 py-2 text-white disabled:opacity-50"
            @click="remove"
          >
            {{ deleting ? 'Suppression…' : 'Confirmer la suppression' }}
          </button>
          <button
            :disabled="deleting"
            class="underline"
            @click="confirming = false"
          >
            Annuler
          </button>
        </div>
      </div>
      <p
        v-if="deleteError"
        role="alert"
        class="mt-4 text-red-700"
      >
        {{ deleteError }}
      </p>
      <AnalysisImport
        :key="project.id"
        :project-id="project.id"
      />
      <ProjectAnalyses :project-id="project.id" />
    </div>
  </section>
</template>
