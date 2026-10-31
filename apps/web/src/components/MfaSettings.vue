<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AuthProfile, MfaSetup } from '@codeaudit/contracts';
import { acceptProfile, clearSession } from '../auth-state';
import { credentialsBody, emptyCredentials, securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
import SensitiveCredentials from './SensitiveCredentials.vue';
defineProps<{ enabled: boolean; available: boolean; remaining: number; verified: boolean }>(); const emit = defineEmits<{ updated: [remaining: number] }>(); const router = useRouter();
const credentials = ref(emptyCredentials()); const setup = ref<MfaSetup | null>(null); const code = ref(''); const recoveryCodes = ref<string[]>([]); const confirming = ref(false); const { busy, error, message, perform } = useAccountAction();
onScopeDispose(() => { credentials.value = emptyCredentials(); setup.value = null; recoveryCodes.value = []; code.value = ''; });
function begin() { void perform(signal => securityMutation<MfaSetup>('mfa/setup', credentialsBody(credentials.value), signal), result => { setup.value = result; credentials.value = emptyCredentials(); recoveryCodes.value = []; }); }
function enable() { void perform(signal => securityMutation<{ profile: AuthProfile; recoveryCodes: string[] }>('mfa/enable', { code: code.value }, signal), result => { acceptProfile(result.profile); recoveryCodes.value = result.recoveryCodes; setup.value = null; code.value = ''; message.value = 'Double authentification activée. Conservez vos codes de secours avant de quitter cette page.'; emit('updated', result.recoveryCodes.length); }); }
function disable() { void perform(signal => securityMutation<void>('mfa/disable', credentialsBody(credentials.value), signal), async () => { credentials.value = emptyCredentials(); recoveryCodes.value = []; clearSession(); await router.replace('/login?reason=mfa-disabled'); }); }
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="mfa-title"
  >
    <h2
      id="mfa-title"
      class="font-semibold"
    >
      Double authentification
    </h2><p class="mt-3 text-sm">
      {{ enabled ? `Active · ${remaining} codes de secours disponibles.` : 'Protégez la connexion avec une application d’authentification compatible TOTP.' }}
    </p><p
      v-if="!available"
      class="notice notice-warning mt-4"
    >
      {{ enabled ? 'La clé serveur est indisponible. Utilisez un code de secours pour vous reconnecter ou désactiver la 2FA.' : 'La clé de chiffrement serveur doit être configurée pour utiliser la 2FA.' }}
    </p>
    <p
      v-if="!verified && !enabled"
      class="field-help mt-4"
    >
      Vérifiez d’abord votre adresse e-mail dans la section ci-dessus.
    </p>
    <form
      v-if="!enabled && !setup && available && verified"
      class="mt-5"
      :aria-busy="busy"
      @submit.prevent="begin"
    >
      <fieldset
        :disabled="busy"
        class="space-y-4"
      >
        <SensitiveCredentials
          v-model="credentials"
          prefix="mfa-setup"
          :mfa="false"
        /><button class="button-primary">
          Configurer la double authentification
        </button>
      </fieldset>
    </form>
    <div
      v-if="setup"
      class="mt-5"
    >
      <p class="text-sm">
        Ajoutez ce compte dans votre application avec la clé ci-dessous, puis saisissez le code à six chiffres. Cette configuration expire après dix minutes.
      </p><label
        for="totp-secret"
        class="field-label mt-4"
      >Clé de configuration 2FA</label><input
        id="totp-secret"
        :value="setup.secret"
        class="field font-mono"
        readonly
        autocomplete="off"
        spellcheck="false"
      ><a
        :href="setup.uri"
        class="text-link mt-3 inline-block"
      >Ouvrir dans une application d’authentification</a><form
        class="mt-5"
        @submit.prevent="enable"
      >
        <fieldset
          :disabled="busy"
          class="space-y-4"
        >
          <div>
            <label
              for="totp-confirm"
              class="field-label"
            >Code de confirmation à six chiffres</label><input
              id="totp-confirm"
              v-model="code"
              class="field font-mono"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              autocomplete="one-time-code"
            >
          </div><button class="button-primary">
            Activer la double authentification
          </button>
        </fieldset>
      </form>
    </div>
    <div
      v-if="recoveryCodes.length"
      class="notice notice-warning block mt-5"
    >
      <h3 class="font-semibold">
        Codes de secours — affichés une seule fois
      </h3><p class="mt-2 text-sm">
        Enregistrez-les dans un endroit sûr. Chacun remplace un code 2FA une seule fois. Ils ne seront pas réaffichés.
      </p><ul class="mt-4 grid gap-2 font-mono text-xs sm:grid-cols-2">
        <li
          v-for="value in recoveryCodes"
          :key="value"
          class="break-all"
        >
          {{ value }}
        </li>
      </ul><button
        class="button-secondary mt-4"
        @click="recoveryCodes = []"
      >
        J’ai conservé mes codes, les masquer
      </button>
    </div>
    <details
      v-if="enabled"
      class="mt-6"
    >
      <summary class="cursor-pointer text-sm font-semibold">
        Désactiver la double authentification
      </summary><form
        class="mt-4"
        @submit.prevent="confirming = true"
      >
        <fieldset
          :disabled="busy"
          class="space-y-4"
        >
          <SensitiveCredentials
            v-model="credentials"
            prefix="mfa-disable"
            :mfa="true"
          /><button class="button-danger">
            Désactiver la 2FA
          </button>
        </fieldset>
      </form><div
        v-if="confirming"
        class="notice notice-warning block mt-4"
        @keydown.esc="confirming = false"
      >
        <p>Tous les appareils et clés CI seront déconnectés. Confirmer la désactivation ?</p><div class="mt-3 flex flex-wrap gap-3">
          <button
            class="button-danger"
            :disabled="busy"
            @click="disable"
          >
            Confirmer la désactivation 2FA
          </button><button
            class="button-secondary"
            :disabled="busy"
            @click="confirming = false"
          >
            Annuler
          </button>
        </div>
      </div>
    </details>
    <p
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
