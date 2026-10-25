<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CreateProjectRequest } from '@codeaudit/contracts';
import ProjectForm from '../components/ProjectForm.vue';
import { projectsApi } from '../api/projects';
import { useResource } from '../composables/useResource';

const route = useRoute();
const router = useRouter();
const { data: project, loading, error, reload } = useResource(
  (signal) => projectsApi.get(String(route.params.id), signal), () => String(route.params.id),
);
const saving = ref(false);
const saveError = ref('');

async function save(input: CreateProjectRequest): Promise<void> {
  if (!project.value || saving.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    const updated = await projectsApi.update(project.value.id, input);
    await router.push({ path: `/projects/${updated.id}`, query: { updated: '1' } });
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : 'Impossible de modifier le projet.';
  } finally { saving.value = false; }
}
</script>

<template>
  <section>
    <RouterLink
      :to="`/projects/${route.params.id}`"
      class="underline"
    >Retour au projet</RouterLink>
    <h1 class="mb-6 mt-5 text-3xl font-bold">
      Modifier le projet
    </h1>
    <p
      v-if="loading"
      role="status"
    >
      Chargement du projet…
    </p>
    <div
      v-else-if="error"
      role="alert"
      class="text-red-700"
    >
      <p>{{ error }}</p>
      <button
        class="mt-3 underline"
        @click="reload"
      >
        Réessayer
      </button>
    </div>
    <template v-else-if="project">
      <p
        v-if="saveError"
        role="alert"
        class="mb-5 text-red-700"
      >
        {{ saveError }}
      </p>
      <ProjectForm
        :key="project.id"
        :initial-project="project"
        :busy="saving"
        submit-label="Enregistrer les modifications"
        @submit="save"
      />
    </template>
  </section>
</template>
