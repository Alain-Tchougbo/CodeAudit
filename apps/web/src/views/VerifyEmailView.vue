<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { clearSession } from '../auth-state';
import { securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
const route = useRoute(); const router = useRouter(); const token = computed(() => new URLSearchParams(route.hash.slice(1)).get('token') ?? ''); const done = ref(false); const changed = ref(false); const { busy, error, perform } = useAccountAction();
function confirm() { void perform(signal => securityMutation<{ changed: boolean }>('verify-email', { token: token.value }, signal), async result => { changed.value = result.changed; if (result.changed) clearSession(); done.value = true; await router.replace('/verify-email'); }); }
</script>
<template>
  <section class="mx-auto min-h-screen max-w-xl px-6 pb-12 pt-28 sm:pt-36">
    <p class="eyebrow">
      Votre compte
    </p><h1 class="page-title">
      Confirmer mon adresse e-mail
    </h1><p
      v-if="done"
      role="status"
      class="notice notice-success mt-6"
    >
      {{ changed ? 'Votre nouvelle adresse est confirmée. Reconnectez-vous avec cette adresse.' : 'Votre adresse e-mail est vérifiée.' }}
    </p><template v-else>
      <p class="page-description mt-4">
        Confirmez cette action uniquement si vous avez demandé ce message. Le lien expire après 30 minutes.
      </p><button
        v-if="/^[a-f0-9]{64}$/.test(token)"
        class="button-primary mt-6"
        :disabled="busy"
        @click="confirm"
      >
        {{ busy ? 'Confirmation…' : 'Confirmer cette adresse e-mail' }}
      </button><p
        v-else
        role="alert"
        class="notice notice-error mt-6"
      >
        Le lien de confirmation est incomplet.
      </p><p
        v-if="error"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ error }}
      </p>
    </template><div class="mt-6 flex flex-wrap gap-3">
      <RouterLink
        to="/profile"
        class="button-secondary"
      >Mon profil</RouterLink><RouterLink
        to="/login"
        class="text-link"
      >Se connecter</RouterLink>
    </div>
  </section>
</template>
