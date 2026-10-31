<script setup lang="ts">
import { ref } from 'vue';
import { authState } from '../auth-state';
import { credentialsBody, emptyCredentials, securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
import SensitiveCredentials from './SensitiveCredentials.vue';
import { date } from '../format';
defineProps<{ verifiedAt: string | null; mfa: boolean }>();
const email = ref(''); const credentials = ref(emptyCredentials()); const { busy, error, message, perform } = useAccountAction();
function send() { void perform(signal => securityMutation<{ message: string }>('verification-request', {}, signal), result => { message.value = result.message; }); }
function change() { void perform(signal => securityMutation<{ message: string }>('change-email', { ...credentialsBody(credentials.value), email: email.value.trim().toLowerCase() }, signal), result => { message.value = `${result.message} L’adresse actuelle reste valable jusqu’à confirmation. Vous serez ensuite déconnecté.`; credentials.value = emptyCredentials(); email.value = ''; }); }
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="email-security-title"
  >
    <h2
      id="email-security-title"
      class="font-semibold"
    >
      Adresse e-mail
    </h2><p class="mt-3 break-all text-sm">
      {{ authState.user.value?.email }}
    </p><p
      class="mt-2 text-sm"
      :class="verifiedAt ? 'text-emerald-700' : 'text-amber-800'"
    >
      {{ verifiedAt ? `Adresse vérifiée le ${date(verifiedAt)}.` : 'Cette adresse n’est pas encore vérifiée.' }}
    </p><button
      v-if="!verifiedAt"
      class="button-secondary mt-4"
      :disabled="busy"
      @click="send"
    >
      Envoyer le lien de vérification
    </button><details class="mt-6">
      <summary class="cursor-pointer text-sm font-semibold">
        Changer d’adresse e-mail
      </summary><p class="field-help mt-3">
        La nouvelle adresse doit être confirmée par e-mail. Les sessions, liens de récupération et clés CI seront révoqués après confirmation.
      </p><form
        class="mt-4 space-y-4"
        :aria-busy="busy"
        @submit.prevent="change"
      >
        <fieldset
          :disabled="busy"
          class="space-y-4"
        >
          <div>
            <label
              for="new-email"
              class="field-label"
            >Nouvelle adresse e-mail</label><input
              id="new-email"
              v-model="email"
              class="field"
              type="email"
              required
              maxlength="254"
              autocomplete="email"
            >
          </div><SensitiveCredentials
            v-model="credentials"
            prefix="email-change"
            :mfa="mfa"
          /><button class="button-primary">
            Demander le changement d’adresse
          </button>
        </fieldset>
      </form>
    </details><p
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
