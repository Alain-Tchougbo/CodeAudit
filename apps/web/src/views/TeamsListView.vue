<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { teamsApi, teamRoleLabel } from '../api/teams';
import { useResource } from '../composables/useResource';
import ResourceState from '../components/ResourceState.vue';
import EmptyState from '../components/EmptyState.vue';
import AppIcon from '../components/AppIcon.vue';
const router = useRouter(); const { data, loading, error, reload } = useResource(signal => teamsApi.list(signal));
const name = ref(''); const busy = ref(false); const actionError = ref('');
async function create() {
  if (busy.value || !name.value.trim()) return; busy.value = true; actionError.value = '';
  try { const team = await teamsApi.create(name.value.trim()); await router.push(`/teams/${team.id}`); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Création impossible.'; } finally { busy.value = false; }
}
</script>
<template>
  <section>
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Collaborer
        </p><h1>Équipes</h1><p class="page-description">
          Partagez explicitement vos projets et choisissez les droits de chaque membre.
        </p>
      </div><button
        class="button-secondary"
        :disabled="loading"
        @click="reload"
      >
        Actualiser
      </button>
    </div>
    <section
      class="panel mb-8"
      aria-labelledby="create-team-title"
    >
      <h2
        id="create-team-title"
        class="font-semibold"
      >
        Créer une équipe
      </h2><form
        class="mt-4 flex flex-wrap items-end gap-3"
        :aria-busy="busy"
        @submit.prevent="create"
      >
        <div class="min-w-0 flex-1">
          <label
            for="team-name"
            class="field-label"
          >Nom de l’équipe</label><input
            id="team-name"
            v-model="name"
            class="field"
            required
            maxlength="120"
            :disabled="busy"
            placeholder="Ex. Équipe plateforme"
          >
        </div><button
          class="button-primary"
          :disabled="busy"
        >
          {{ busy ? 'Création…' : 'Créer l’équipe' }}
        </button>
      </form><p
        v-if="actionError"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ actionError }}
      </p>
    </section>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <EmptyState
      v-if="data?.length === 0 && !loading && !error"
      icon="folder"
      title="Aucune équipe pour le moment."
      description="Créez une équipe ou acceptez le lien reçu par e-mail. Vos projets restent personnels tant que vous ne les partagez pas."
    />
    <ul
      v-if="data?.length && !loading && !error"
      class="table-surface divide-y divide-slate-100"
    >
      <li
        v-for="team in data"
        :key="team.id"
      >
        <RouterLink
          :to="`/teams/${team.id}`"
          class="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-[#fbfcf9]"
        ><div class="min-w-0"><h2 class="break-words font-semibold">{{ team.name }}</h2><p class="mt-2 text-xs text-slate-500">{{ team.memberCount }} membre{{ team.memberCount > 1 ? 's' : '' }} · {{ team.projectCount }} projet{{ team.projectCount > 1 ? 's' : '' }}</p></div><span class="status-badge badge-queued">{{ teamRoleLabel[team.role] }}</span><AppIcon
          name="arrow"
          :size="17"
        /></RouterLink>
      </li>
    </ul>
  </section>
</template>
