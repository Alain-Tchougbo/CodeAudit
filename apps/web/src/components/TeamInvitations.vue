<script setup lang="ts">
import { ref } from 'vue';
import type { TeamInvitation } from '@codeaudit/contracts';
import { teamsApi, teamRoleLabel } from '../api/teams';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
import { date } from '../format';
const props = defineProps<{ teamId: string }>(); const { data, loading, error, reload } = useResource(signal => teamsApi.invitations(props.teamId, signal), () => props.teamId);
const email = ref(''); const role = ref<'MEMBER' | 'READER'>('MEMBER'); const busy = ref(false); const actionError = ref(''); const success = ref(''); const selected = ref<TeamInvitation | null>(null);
async function invite() {
  if (busy.value) return; busy.value = true; actionError.value = ''; success.value = '';
  try { const result = await teamsApi.invite(props.teamId, email.value.trim().toLowerCase(), role.value); success.value = result.message; email.value = ''; reload(); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Invitation impossible.'; } finally { busy.value = false; }
}
async function revoke() {
  if (!selected.value || busy.value) return; busy.value = true; actionError.value = ''; success.value = '';
  try { await teamsApi.revoke(props.teamId, selected.value.id); selected.value = null; success.value = 'Invitation révoquée.'; reload(); }
  catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Révocation impossible.'; } finally { busy.value = false; }
}
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="invitations-title"
  >
    <h2
      id="invitations-title"
      class="font-semibold"
    >
      Invitations
    </h2><p class="mt-3 text-sm text-slate-600">
      L’accès est accordé après acceptation d’un lien envoyé à cette adresse, avec un compte correspondant. Un nouveau lien remplace le précédent et expire après sept jours.
    </p>
    <form
      class="mt-5"
      :aria-busy="busy"
      @submit.prevent="invite"
    >
      <fieldset
        :disabled="busy"
        class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]"
      >
        <div>
          <label
            for="invite-email"
            class="field-label"
          >Adresse e-mail à inviter</label><input
            id="invite-email"
            v-model="email"
            class="field"
            type="email"
            required
            maxlength="254"
            autocomplete="off"
          >
        </div><div>
          <label
            for="invite-role"
            class="field-label"
          >Rôle proposé</label><select
            id="invite-role"
            v-model="role"
            class="field"
          >
            <option value="MEMBER">
              Membre
            </option><option value="READER">
              Lecture seule
            </option>
          </select>
        </div><button class="button-primary justify-self-start">
          {{ busy ? 'Veuillez patienter…' : 'Envoyer l’invitation' }}
        </button>
      </fieldset>
    </form>
    <p
      v-if="success"
      role="status"
      class="notice notice-success mt-4"
    >
      {{ success }}
    </p><p
      v-if="actionError"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ actionError }}
    </p>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    />
    <div
      v-if="selected"
      class="notice notice-warning block mt-4"
    >
      <p>Révoquer l’invitation à {{ selected.email }} ? Son lien ne permettra plus de rejoindre l’équipe.</p><div class="mt-3 flex flex-wrap gap-3">
        <button
          class="button-danger"
          :disabled="busy"
          @click="revoke"
        >
          Confirmer la révocation d’invitation
        </button><button
          class="button-secondary"
          :disabled="busy"
          @click="selected = null"
        >
          Annuler
        </button>
      </div>
    </div>
    <ul
      v-if="data && !loading && !error"
      class="mt-5 divide-y divide-slate-100"
    >
      <li
        v-for="invitation in data"
        :key="invitation.id"
        class="flex flex-wrap items-center justify-between gap-4 py-4"
      >
        <div class="min-w-0">
          <p class="break-all text-sm font-medium">
            {{ invitation.email }}
          </p><p class="mt-1 text-xs text-slate-500">
            {{ teamRoleLabel[invitation.role] }} · Expire le {{ date(invitation.expiresAt) }}
          </p>
        </div><button
          class="button-secondary"
          :aria-label="`Révoquer l’invitation à ${invitation.email}`"
          :disabled="busy"
          @click="selected = invitation"
        >
          Révoquer
        </button>
      </li>
    </ul><p
      v-if="data?.length === 0 && !loading && !error"
      class="mt-5 text-sm text-slate-500"
    >
      Aucune invitation active.
    </p>
  </section>
</template>
