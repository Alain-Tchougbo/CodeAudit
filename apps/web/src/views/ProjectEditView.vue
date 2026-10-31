<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
import ResourceState from '../components/ResourceState.vue';
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
      class="back-link"
    ><AppIcon
      name="back"
      :size="16"
    />Retour au projet</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Informations du projet
        </p><h1>Modifier le projet</h1><p class="page-description">
          Gardez un nom et une description qui parlent à votre futur vous.
        </p>
      </div>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <div
      v-if="project && !loading && !error"
      class="form-layout"
    >
      <div class="panel">
        <p
          v-if="saveError"
          role="alert"
          class="notice notice-error"
        >
          {{ saveError }}
        </p><ProjectForm
          :key="project.id"
          :initial-project="project"
          :busy="saving"
          submit-label="Enregistrer les modifications"
          @submit="save"
        />
      </div><aside class="form-aside">
        <h2 class="mb-3 font-semibold text-slate-800">
          Un historique préservé
        </h2><p>La modification des informations du projet ne réécrit pas les rapports existants. Chaque analyse conserve les informations enregistrées à sa création.</p>
      </aside>
    </div>
  </section>
</template>
