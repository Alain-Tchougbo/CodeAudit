<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { clearSession } from '../auth-state';
import { credentialsBody, downloadPersonalData, emptyCredentials, securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
import SensitiveCredentials from './SensitiveCredentials.vue';
defineProps<{ mfa: boolean }>(); const router = useRouter(); const credentials = ref(emptyCredentials()); const confirmation = ref(''); const action = ref<'export' | 'delete' | null>(null); const { busy, error, message, perform } = useAccountAction();
function submit() { if (action.value === 'export') void perform(signal => downloadPersonalData(credentials.value, signal), blob => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'codeaudit-account-v1.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); credentials.value = emptyCredentials(); message.value = 'Export des données personnelles téléchargé.'; action.value = null; }); else if (action.value === 'delete' && confirmation.value === 'SUPPRIMER') void perform(signal => securityMutation<void>('account', { ...credentialsBody(credentials.value), confirmation: confirmation.value }, signal, 'DELETE'), async () => { credentials.value = emptyCredentials(); clearSession(); await router.replace('/login?reason=account-deleted'); }); }
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="personal-data-title"
  >
    <h2
      id="personal-data-title"
      class="font-semibold"
    >
      Mes données personnelles
    </h2><p class="field-help mt-3">
      L’export JSON versionné inclut votre profil, les métadonnées des sessions et clés, vos associations, vos événements récents et vos projets personnels avec leurs rapports. Les secrets et extraits de sources sont exclus ; les projets partagés sont référencés sans leurs rapports.
    </p><div class="mt-5 flex flex-wrap gap-3">
      <button
        class="button-secondary"
        :disabled="busy"
        @click="action = 'export'; credentials = emptyCredentials(); confirmation = ''"
      >
        Exporter mes données personnelles
      </button><button
        class="button-danger"
        :disabled="busy"
        @click="action = 'delete'; credentials = emptyCredentials(); confirmation = ''"
      >
        Supprimer mon compte
      </button>
    </div><form
      v-if="action"
      class="mt-5"
      :aria-busy="busy"
      @submit.prevent="submit"
    >
      <fieldset
        :disabled="busy"
        class="space-y-4"
      >
        <p
          v-if="action === 'delete'"
          class="notice notice-error"
        >
          Cette action est irréversible. Les projets personnels, leurs analyses et les accès seront supprimés. Les projets partagés restent aux équipes. Nommez un autre administrateur si vous êtes le dernier ; terminez ou annulez d’abord vos analyses personnelles en cours.
        </p><SensitiveCredentials
          v-model="credentials"
          prefix="personal-data"
          :mfa="mfa"
        /><div v-if="action === 'delete'">
          <label
            for="delete-account-confirmation"
            class="field-label"
          >Saisir SUPPRIMER pour confirmer</label><input
            id="delete-account-confirmation"
            v-model="confirmation"
            class="field"
            required
            pattern="SUPPRIMER"
            autocomplete="off"
            spellcheck="false"
          >
        </div><div class="flex flex-wrap gap-3">
          <button
            :class="action === 'delete' ? 'button-danger' : 'button-primary'"
            :disabled="action === 'delete' && confirmation !== 'SUPPRIMER'"
          >
            {{ action === 'delete' ? 'Confirmer la suppression du compte' : 'Télécharger mes données JSON' }}
          </button><button
            type="button"
            class="button-secondary"
            @click="action = null; credentials = emptyCredentials()"
          >
            Annuler
          </button>
        </div>
      </fieldset>
    </form><p
      v-if="error"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ error }}
    </p><p
      v-if="message"
      role="status"
      class="notice notice-success mt-4"
    >
      {{ message }}
    </p>
  </section>
</template>
