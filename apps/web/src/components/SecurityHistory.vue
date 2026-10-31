<script setup lang="ts">
import { ref } from 'vue';
import type { SecurityEventsPage } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
import { date } from '../format';
const cursor = ref(''); const previous = ref<string[]>([]);
const { data, loading, error, reload } = useResource(signal => apiJson<SecurityEventsPage>(`/auth/security-events${cursor.value ? `?cursor=${encodeURIComponent(cursor.value)}` : ''}`, { signal }), () => cursor.value);
const labels: Record<string, string> = { REGISTERED: 'Compte créé', LOGIN_SUCCEEDED: 'Connexion réussie', LOGIN_FAILED: 'Tentative de connexion refusée', LOGOUT: 'Déconnexion', SESSION_REVOKED: 'Session révoquée', ALL_SESSIONS_REVOKED: 'Déconnexion de tous les appareils', PASSWORD_RESET_REQUESTED: 'Récupération demandée', PASSWORD_RESET: 'Mot de passe réinitialisé', PROFILE_UPDATED: 'Profil modifié', EMAIL_VERIFICATION_SENT: 'Vérification e-mail envoyée', EMAIL_VERIFIED: 'Adresse e-mail vérifiée', EMAIL_CHANGE_REQUESTED: 'Changement d’adresse demandé', EMAIL_CHANGED: 'Adresse e-mail changée', PASSWORD_CHANGED: 'Mot de passe changé', MFA_SETUP_STARTED: 'Configuration 2FA commencée', MFA_ENABLED: '2FA activée', MFA_DISABLED: '2FA désactivée', MFA_RECOVERY_USED: 'Code de secours utilisé', OAUTH_LINKED: 'Compte externe associé', OAUTH_UNLINKED: 'Compte externe dissocié', OAUTH_LOGIN_SUCCEEDED: 'Connexion externe réussie', DATA_EXPORTED: 'Données personnelles exportées' };
function next() { if (data.value?.nextCursor) { previous.value.push(cursor.value); cursor.value = data.value.nextCursor; } }
function refresh() { previous.value = []; cursor.value = ''; reload(); }
</script>
<template>
  <section
    class="mt-8"
    aria-labelledby="security-history-title"
  >
    <div class="section-heading">
      <div>
        <h2 id="security-history-title">
          Événements de sécurité
        </h2><p class="field-help">
          Événements enregistrés depuis l’activation de ce journal, conservés pendant 90 jours. Les événements plus anciens ne sont pas reconstitués.
        </p>
      </div><button
        class="button-secondary"
        :disabled="loading"
        @click="refresh"
      >
        Actualiser les événements
      </button>
    </div><ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    /><p
      v-if="data?.items.length === 0 && !loading && !error"
      class="panel text-sm"
    >
      Aucun événement enregistré pour cette période.
    </p><ul
      v-if="data?.items.length && !loading && !error"
      class="table-surface divide-y divide-slate-100"
    >
      <li
        v-for="event in data.items"
        :key="event.id"
        class="flex flex-wrap justify-between gap-3 p-4 text-sm"
      >
        <div>
          <p class="font-medium">
            {{ labels[event.type] ?? event.type }}
          </p><p
            v-if="event.provider"
            class="mt-1 text-xs text-slate-500"
          >
            {{ event.provider }}
          </p>
        </div><time
          :datetime="event.createdAt"
          class="text-xs text-slate-500"
        >{{ date(event.createdAt) }}</time>
      </li>
    </ul><div
      v-if="data && !loading && !error"
      class="mt-4 flex justify-between gap-3"
    >
      <button
        class="button-secondary"
        :disabled="!previous.length"
        @click="cursor = previous.pop() ?? ''"
      >
        Événements précédents
      </button><button
        class="button-secondary"
        :disabled="!data.nextCursor"
        @click="next"
      >
        Événements suivants
      </button>
    </div>
  </section>
</template>
