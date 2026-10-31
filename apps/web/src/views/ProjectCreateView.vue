<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
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
      class="back-link"
    ><AppIcon
      name="back"
      :size="16"
    />Retour aux projets</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Un nouveau point de départ
        </p><h1>Ajouter un projet</h1><p class="page-description">
          Organisez vos sources et retrouvez toutes leurs analyses au même endroit.
        </p>
      </div>
    </div>
    <div class="form-layout">
      <div class="panel">
        <p
          v-if="error"
          role="alert"
          class="notice notice-error"
        >
          {{ error }}
        </p><ProjectForm
          :busy="saving"
          submit-label="Créer le projet"
          @submit="create"
        />
      </div>
      <aside class="form-aside">
        <span class="empty-icon"><AppIcon
          name="folder"
          :size="24"
        /></span><h2 class="mb-3 font-semibold text-slate-800">
          Et ensuite ?
        </h2><p>Importez une archive ZIP depuis la page du projet pour lancer votre première analyse.</p><p class="mt-4">
          Les rapports restent disponibles dans l’historique, indépendamment des analyses suivantes.
        </p><p class="mt-6 border-t border-[#dfe5df] pt-5 text-xs">
          Ce projet sera accessible uniquement depuis votre compte.
        </p>
      </aside>
    </div>
  </section>
</template>
