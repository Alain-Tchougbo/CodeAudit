<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { teamsApi, teamRoleLabel } from '../api/teams';
import { projectsApi } from '../api/projects';
import { authState } from '../auth-state';
import { useResource } from '../composables/useResource';
import ResourceState from '../components/ResourceState.vue';
import TeamMembers from '../components/TeamMembers.vue';
import TeamInvitations from '../components/TeamInvitations.vue';
const route = useRoute(); const router = useRouter();
const { data, loading, error, reload } = useResource(async signal => {
  const id = String(route.params.id); const [team, projects] = await Promise.all([teamsApi.get(id, signal), projectsApi.list(signal)]);
  return { team, projects: projects.filter(project => project.team?.id === id) };
}, () => String(route.params.id));
const name = ref(''); const confirming = ref(false); const busy = ref(false); const actionError = ref(''); const success = ref('');
async function change(remove = false) {
  const id = data.value?.team.id; if (!id || busy.value) return; busy.value = true; actionError.value = ''; success.value = '';
  try { if (remove) { await teamsApi.delete(id); if (route.params.id === id) await router.push('/teams'); } else { await teamsApi.rename(id, name.value.trim()); if (route.params.id === id) { success.value = 'Équipe renommée.'; reload(); } } }
  catch (cause) { if (route.params.id === id) actionError.value = cause instanceof Error ? cause.message : 'Modification impossible.'; } finally { busy.value = false; }
}
</script>
<template>
  <section>
    <RouterLink
      to="/teams"
      class="back-link"
    >Retour aux équipes</RouterLink><ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <template v-if="data && !loading && !error">
      <div class="page-heading">
        <div>
          <p class="eyebrow">
            Équipe · {{ teamRoleLabel[data.team.role] }}
          </p><h1 class="break-words">
            {{ data.team.name }}
          </h1><p class="page-description">
            {{ data.team.memberCount }} membres · {{ data.team.projectCount }} projets partagés
          </p>
        </div><button
          class="button-secondary"
          @click="reload"
        >
          Actualiser
        </button>
      </div>
      <section
        v-if="data.team.role === 'ADMIN'"
        class="panel"
      >
        <form
          class="flex flex-wrap items-end gap-3"
          @submit.prevent="change()"
        >
          <div class="min-w-0 flex-1">
            <label
              for="rename-team"
              class="field-label"
            >Nouveau nom de l’équipe</label><input
              id="rename-team"
              v-model="name"
              class="field"
              required
              maxlength="120"
              :placeholder="data.team.name"
              :disabled="busy"
            >
          </div><button
            class="button-secondary"
            :disabled="busy || !name.trim()"
          >
            Renommer
          </button><button
            type="button"
            class="button-danger"
            :disabled="busy"
            @click="confirming = !confirming"
          >
            Supprimer l’équipe
          </button>
        </form><div
          v-if="confirming"
          class="notice notice-warning block mt-4"
          @keydown.esc="confirming = false"
        >
          <p>Supprimer cette équipe ? Seule une équipe sans projet peut être supprimée. Les invitations seront révoquées.</p><div class="mt-3 flex gap-3">
            <button
              class="button-danger"
              :disabled="busy"
              @click="change(true)"
            >
              Confirmer la suppression de l’équipe
            </button><button
              class="button-secondary"
              :disabled="busy"
              @click="confirming = false"
            >
              Annuler
            </button>
          </div>
        </div>
      </section>
      <p
        v-if="actionError"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ actionError }}
      </p><p
        v-if="success"
        role="status"
        class="notice notice-success mt-4"
      >
        {{ success }}
      </p>
      <TeamMembers
        :key="data.team.id"
        :team-id="data.team.id"
        :members="data.team.members"
        :viewer-id="authState.user.value?.id ?? ''"
        :admin="data.team.role === 'ADMIN'"
        @updated="reload"
        @left="router.push('/teams')"
      />
      <section class="mt-8">
        <h2 class="mb-4 font-semibold">
          Projets partagés
        </h2><p
          v-if="!data.projects.length"
          class="panel text-sm text-slate-600"
        >
          Aucun projet partagé. Ouvrez un projet personnel pour le rattacher explicitement à cette équipe.
        </p><ul
          v-else
          class="table-surface divide-y divide-slate-100"
        >
          <li
            v-for="project in data.projects"
            :key="project.id"
          >
            <RouterLink
              :to="`/projects/${project.id}`"
              class="block p-5 hover:bg-slate-50"
            ><h3 class="break-words font-semibold">{{ project.name }}</h3><p class="mt-2 break-words text-sm text-slate-500">{{ project.description || 'Aucune description.' }}</p></RouterLink>
          </li>
        </ul>
      </section>
      <TeamInvitations
        v-if="data.team.role === 'ADMIN'"
        :key="`invites-${data.team.id}`"
        :team-id="data.team.id"
      />
    </template>
  </section>
</template>
