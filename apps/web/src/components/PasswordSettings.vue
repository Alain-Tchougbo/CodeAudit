<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { clearSession } from '../auth-state';
import { credentialsBody, emptyCredentials, securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
import SensitiveCredentials from './SensitiveCredentials.vue';
defineProps<{ mfa: boolean }>(); const router = useRouter(); const credentials = ref(emptyCredentials()); const password = ref(''); const confirmation = ref(''); const { busy, error, perform } = useAccountAction();
function save() { if (password.value !== confirmation.value) { error.value = 'Les nouveaux mots de passe ne correspondent pas.'; return; } void perform(signal => securityMutation<void>('change-password', { ...credentialsBody(credentials.value), password: password.value }, signal), async () => { credentials.value = emptyCredentials(); password.value = ''; confirmation.value = ''; clearSession(); await router.replace('/login?reason=password-changed'); }); }
</script>
<template>
  <details class="panel mt-8">
    <summary class="cursor-pointer font-semibold">
      Changer mon mot de passe
    </summary><p class="field-help mt-3">
      Le changement déconnecte tous les appareils et révoque les clés CI et liens en attente. La 2FA reste active.
    </p><form
      class="mt-5"
      :aria-busy="busy"
      @submit.prevent="save"
    >
      <fieldset
        :disabled="busy"
        class="space-y-4"
      >
        <SensitiveCredentials
          v-model="credentials"
          prefix="password-change"
          :mfa="mfa"
        /><div>
          <label
            for="new-password"
            class="field-label"
          >Nouveau mot de passe</label><input
            id="new-password"
            v-model="password"
            class="field"
            type="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
          >
        </div><div>
          <label
            for="confirm-new-password"
            class="field-label"
          >Confirmer le nouveau mot de passe</label><input
            id="confirm-new-password"
            v-model="confirmation"
            class="field"
            type="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
          >
        </div><button class="button-primary">
          Changer le mot de passe
        </button>
      </fieldset>
    </form><p
      v-if="error"
      role="alert"
      class="notice notice-error mt-4"
    >
      {{ error }}
    </p>
  </details>
</template>
