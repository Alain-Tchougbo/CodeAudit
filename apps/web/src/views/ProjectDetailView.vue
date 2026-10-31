<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { projectsApi } from '../api/projects';
import { useResource } from '../composables/useResource';
import ProjectAnalyses from '../components/ProjectAnalyses.vue';
import AnalysisImport from '../components/AnalysisImport.vue';
import ResourceState from '../components/ResourceState.vue';
import AppIcon from '../components/AppIcon.vue';
import { date } from '../format';
const route = useRoute(); const router = useRouter();
const { data: project, loading, error, reload } = useResource((signal) => projectsApi.get(String(route.params.id), signal), () => String(route.params.id));
const confirming = ref(false); const deleting = ref(false); const deleteError = ref('');
const deleteTrigger = ref<HTMLButtonElement>(); const cancelButton = ref<HTMLButtonElement>();
watch(confirming, async (value) => { await nextTick(); if (value) cancelButton.value?.focus(); else deleteTrigger.value?.focus(); });
async function remove(): Promise<void> {
  if (!project.value || deleting.value) return; deleting.value = true; deleteError.value = '';
  try { await projectsApi.delete(project.value.id); await router.push({ path: '/projects', query: { deleted: '1' } }); }
  catch (cause) { deleteError.value = cause instanceof Error ? cause.message : 'Impossible de supprimer le projet.'; }
  finally { deleting.value = false; }
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
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="project && !loading && !error">
      <p
        v-if="route.query.created === '1'"
        role="status"
        class="notice notice-success"
      >
        <AppIcon
          name="check"
          :size="18"
        />Projet créé.
      </p>
      <p
        v-if="route.query.updated === '1'"
        role="status"
        class="notice notice-success"
      >
        <AppIcon
          name="check"
          :size="18"
        />Projet modifié.
      </p>
      <div class="page-heading">
        <div class="min-w-0 flex-1">
          <p class="eyebrow">
            Espace projet
          </p><h1 class="break-words">
            {{ project.name }}
          </h1><p class="page-description whitespace-pre-wrap break-words">
            {{ project.description || 'Aucune description.' }}
          </p>
        </div><div class="flex flex-wrap gap-2">
          <RouterLink
            :to="`/projects/${project.id}/edit`"
            class="button-secondary"
          >Modifier le projet</RouterLink><button
            ref="deleteTrigger"
            :disabled="deleting"
            class="button-danger"
            :aria-expanded="confirming"
            :aria-controls="confirming ? 'delete-confirmation' : undefined"
            @click="confirming = true"
          >
            Supprimer le projet
          </button>
        </div>
      </div>
      <dl class="mb-8 flex flex-wrap gap-x-8 gap-y-3 border-b border-[#dfe5df] pb-6 text-xs text-slate-500">
        <div>
          <dt class="inline">
            Créé le
          </dt><dd class="inline text-slate-700">
            {{ date(project.createdAt) }}
          </dd>
        </div><div>
          <dt class="inline">
            Modifié le
          </dt><dd class="inline text-slate-700">
            {{ date(project.updatedAt) }}
          </dd>
        </div>
      </dl>
      <section
        v-if="confirming"
        id="delete-confirmation"
        class="notice notice-error block p-5"
        aria-label="Confirmation de suppression"
        @keydown.esc="confirming = false"
      >
        <h2 class="font-semibold">
          Supprimer ce projet ?
        </h2><p class="mt-2 text-sm">
          Supprimer définitivement ce projet et ses analyses terminées ? Cette action est irréversible.
        </p>
        <div class="mt-4 flex flex-wrap gap-3">
          <button
            :disabled="deleting"
            class="button-danger"
            @click="remove"
          >
            {{ deleting ? 'Suppression…' : 'Confirmer la suppression' }}
          </button><button
            ref="cancelButton"
            :disabled="deleting"
            class="button-secondary"
            @click="confirming = false"
          >
            Annuler
          </button>
        </div>
      </section>
      <p
        v-if="deleteError"
        role="alert"
        class="notice notice-error"
      >
        {{ deleteError }}
      </p>
      <AnalysisImport
        :key="project.id"
        :project-id="project.id"
      />
      <ProjectAnalyses :project-id="project.id" />
    </template>
  </section>
</template>
