<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { CreateProjectRequest } from '@codeaudit/contracts';
import ProjectForm from '../components/ProjectForm.vue';
import { projectsApi } from '../api/projects';

const router = useRouter();
const saving = ref(false);
const error = ref('');

async function create(input: CreateProjectRequest): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const project = await projectsApi.create(input);
    await router.push({ path: `/projects/${project.id}`, query: { created: '1' } });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Impossible de créer le projet.';
  } finally { saving.value = false; }
}
</script>

<template>
  <section>
    <RouterLink
      to="/projects"
      class="underline"
    >Retour aux projets</RouterLink>
    <h1 class="mb-6 mt-5 text-3xl font-bold">
      Ajouter un projet
    </h1>
    <p
      v-if="error"
      role="alert"
      class="mb-5 text-red-700"
    >
      {{ error }}
    </p>
    <ProjectForm
      :busy="saving"
      submit-label="Créer le projet"
      @submit="create"
    />
  </section>
</template>
