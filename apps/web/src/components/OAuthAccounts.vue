<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AccountSecurityState, OAuthProvider } from '@codeaudit/contracts';
import { clearSession } from '../auth-state';
import { credentialsBody, emptyCredentials, securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
import SensitiveCredentials from './SensitiveCredentials.vue';
defineProps<{ providers: AccountSecurityState['providers']; identities: AccountSecurityState['identities']; mfa: boolean; verified: boolean }>(); const router = useRouter();
const credentials = ref(emptyCredentials()); const selected = ref<{ provider: OAuthProvider; unlink: boolean } | null>(null); const { busy, error, perform } = useAccountAction();
function submit() { const action = selected.value; if (!action) return; if (action.unlink) void perform(signal => securityMutation<void>(`oauth/${action.provider}/link`, credentialsBody(credentials.value), signal, 'DELETE'), async () => { credentials.value = emptyCredentials(); clearSession(); await router.replace('/login?reason=oauth-unlinked'); }); else void perform(signal => securityMutation<{ url: string }>(`oauth/${action.provider}/link`, credentialsBody(credentials.value), signal), result => { credentials.value = emptyCredentials(); window.location.assign(result.url); }); }
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="oauth-title"
  >
    <h2
      id="oauth-title"
      class="font-semibold"
    >
      Connexion avec GitHub ou GitLab
    </h2><p class="field-help mt-3">
      Vérifiez votre adresse e-mail puis associez explicitement votre compte externe pour l’utiliser à la connexion. Aucune association automatique par adresse e-mail. La 2FA CodeAudit reste requise si elle est active.
    </p><ul class="mt-4 divide-y divide-slate-100">
      <li
        v-for="provider in providers"
        :key="provider.provider"
        class="flex flex-wrap items-center justify-between gap-3 py-4"
      >
        <div>
          <h3 class="font-semibold">
            {{ provider.provider === 'GITHUB' ? 'GitHub' : 'GitLab' }}
          </h3><p class="mt-1 break-all text-sm text-slate-500">
            {{ identities.find(item => item.provider === provider.provider)?.login ?? (provider.configured ? 'Aucun compte associé.' : 'Configuration OAuth serveur requise.') }}
          </p>
        </div><button
          class="button-secondary"
          :disabled="busy || ((!provider.configured || !verified) && !identities.some(item => item.provider === provider.provider))"
          :aria-label="`${identities.some(item => item.provider === provider.provider) ? 'Dissocier' : 'Associer'} ${provider.provider === 'GITHUB' ? 'GitHub' : 'GitLab'}`"
          @click="selected = { provider: provider.provider, unlink: identities.some(item => item.provider === provider.provider) }; credentials = emptyCredentials()"
        >
          {{ identities.some(item => item.provider === provider.provider) ? 'Dissocier' : 'Associer' }}
        </button>
      </li>
    </ul><form
      v-if="selected"
      class="mt-5"
      :aria-busy="busy"
      @submit.prevent="submit"
    >
      <p class="mb-4 text-sm font-semibold">
        {{ selected.unlink ? 'Confirmer la dissociation' : 'Associer un compte' }} {{ selected.provider }}
      </p><fieldset
        :disabled="busy"
        class="space-y-4"
      >
        <SensitiveCredentials
          v-model="credentials"
          prefix="oauth-link"
          :mfa="mfa"
        /><p
          v-if="selected.unlink"
          class="field-help"
        >
          La dissociation ferme les sessions CodeAudit. Votre mot de passe local reste utilisable.
        </p><div class="flex flex-wrap gap-3">
          <button :class="selected.unlink ? 'button-danger' : 'button-primary'">
            {{ selected.unlink ? 'Confirmer la dissociation OAuth' : 'Continuer vers le fournisseur' }}
          </button><button
            type="button"
            class="button-secondary"
            @click="selected = null; credentials = emptyCredentials()"
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
    </p>
  </section>
</template>
