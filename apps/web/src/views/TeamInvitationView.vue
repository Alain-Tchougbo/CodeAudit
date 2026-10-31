<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from '../auth-state';
import { logout } from '../auth';
import { invitationToken } from '../invitation-state';
import { teamsApi, teamRoleLabel } from '../api/teams';
import { useResource } from '../composables/useResource';
import ResourceState from '../components/ResourceState.vue';
const route = useRoute(); const router = useRouter();
const fragment = new URLSearchParams(route.hash.slice(1)).get('token');
if (fragment && /^[a-f0-9]{64}$/.test(fragment)) invitationToken.value = fragment;
const token = computed(() => invitationToken.value);
const { data, loading, error, reload } = useResource(signal => authState.user.value && token.value ? teamsApi.preview(token.value, signal) : Promise.resolve(null), () => `${authState.user.value?.id}:${token.value}`);
const busy = ref(false); const actionError = ref('');
async function accept() {
  if (busy.value || !data.value) return; busy.value = true; actionError.value = '';
  try { const result = await teamsApi.accept(token.value); invitationToken.value = ''; await router.replace(`/teams/${result.teamId}`); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Invitation impossible.'; } finally { busy.value = false; }
}
async function switchAccount() {
  try { await logout(); await router.replace({ path: '/login', query: { redirect: '/team-invitation' } }); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Déconnexion impossible.'; }
}
</script>
<template>
  <section class="mx-auto min-h-screen max-w-xl px-6 pb-12 pt-28 sm:pt-36">
    <p class="eyebrow">
      Collaborer
    </p><h1 class="page-title">
      Rejoindre une équipe
    </h1>
    <p
      v-if="!token"
      role="alert"
      class="notice notice-error mt-6"
    >
      Le lien est incomplet. Ouvrez le lien complet reçu par e-mail.
    </p>
    <template v-else-if="!authState.user.value">
      <p class="page-description">
        Connectez-vous avec l’adresse destinataire de l’invitation, puis acceptez le partage.
      </p><div class="mt-6 flex flex-wrap gap-3">
        <RouterLink
          :to="{ path: '/login', query: { redirect: '/team-invitation' } }"
          class="button-primary"
        >Se connecter</RouterLink><RouterLink
          :to="{ path: '/register', query: { redirect: '/team-invitation' } }"
          class="button-secondary"
        >Créer un compte</RouterLink>
      </div><p class="field-help mt-4">
        Si vous rechargez la page pendant la connexion, rouvrez ensuite le lien de l’e-mail.
      </p>
    </template>
    <template v-else>
      <ResourceState
        :loading="loading"
        :error="error"
        @retry="reload"
      /><div
        v-if="data && !loading && !error"
        class="panel mt-6"
      >
        <h2 class="break-words text-lg font-semibold">
          {{ data.teamName }}
        </h2><p class="mt-4">
          Rôle proposé : {{ teamRoleLabel[data.role] }}.
        </p><p class="mt-3 text-sm text-slate-600">
          Vous pourrez consulter les projets, rapports et extraits déjà partagés avec cette équipe.
        </p><button
          class="button-primary mt-6"
          :disabled="busy"
          @click="accept"
        >
          {{ busy ? 'Acceptation…' : 'Accepter l’invitation' }}
        </button>
      </div><p class="field-help mt-5">
        Compte connecté : {{ authState.user.value.email }}
      </p><button
        class="button-secondary mt-3"
        :disabled="busy"
        @click="switchAccount"
      >
        Changer de compte
      </button>
    </template>
    <p
      v-if="actionError"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ actionError }}
    </p>
  </section>
</template>
