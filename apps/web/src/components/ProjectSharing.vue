<script setup lang="ts">
import { ref } from 'vue';
import { teamsApi } from '../api/teams';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
const props = defineProps<{ projectId: string }>(); const emit = defineEmits<{ updated: [] }>();
const { data, loading, error, reload } = useResource(async signal => (await teamsApi.list(signal)).filter(team => team.role !== 'READER'));
const teamId = ref(''); const confirming = ref(false); const busy = ref(false); const actionError = ref('');
async function share() {
  if (!teamId.value || busy.value) return; busy.value = true; actionError.value = '';
  try { await teamsApi.share(props.projectId, teamId.value); emit('updated'); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Partage impossible.'; } finally { busy.value = false; }
}
</script>
<template>
  <section
    class="panel mb-8"
    aria-labelledby="share-project-title"
  >
    <h2
      id="share-project-title"
      class="font-semibold"
    >
      Partager avec une équipe
    </h2><p class="field-help mt-3">
      Ce projet est personnel. Le partage inclut son historique, ses rapports et les extraits de code enregistrés.
    </p><ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    /><p
      v-if="data?.length === 0 && !loading && !error"
      class="mt-4 text-sm"
    >
      <RouterLink
        to="/teams"
        class="text-link"
      >Créer ou rejoindre une équipe</RouterLink> pour partager ce projet.
    </p>
    <form
      v-if="data?.length && !loading && !error"
      class="mt-4 flex flex-wrap items-end gap-3"
      @submit.prevent="confirming = true"
    >
      <div class="min-w-0 flex-1">
        <label
          for="project-team"
          class="field-label"
        >Équipe destinataire</label><select
          id="project-team"
          v-model="teamId"
          class="field"
          required
          :disabled="busy || confirming"
        >
          <option
            value=""
            disabled
          >
            Choisir une équipe
          </option><option
            v-for="team in data"
            :key="team.id"
            :value="team.id"
          >
            {{ team.name }}
          </option>
        </select>
      </div><button
        class="button-secondary"
        :disabled="busy || !teamId || confirming"
      >
        Partager le projet
      </button>
    </form>
    <div
      v-if="confirming"
      class="notice notice-warning block mt-4"
      @keydown.esc="confirming = false"
    >
      <p>Tout l’historique sera accessible aux membres de l’équipe. Les clés CI existantes seront révoquées. Si vous quittez l’équipe, vous perdrez cet accès même en tant que créateur. Le retour à un projet personnel n’est pas proposé.</p><div class="mt-4 flex flex-wrap gap-3">
        <button
          class="button-primary"
          :disabled="busy"
          @click="share"
        >
          {{ busy ? 'Partage…' : 'Confirmer le partage avec l’équipe' }}
        </button><button
          class="button-secondary"
          :disabled="busy"
          @click="confirming = false"
        >
          Annuler
        </button>
      </div>
    </div><p
      v-if="actionError"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ actionError }}
    </p>
  </section>
</template>
