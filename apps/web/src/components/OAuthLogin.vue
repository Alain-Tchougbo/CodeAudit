<script setup lang="ts">
import { ref } from 'vue';
import type { OAuthProvider } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useAccountAction } from '../composables/useAccountAction';
const providers = ref<{ provider: OAuthProvider; configured: boolean }[] | null>(null); const { busy, error, perform } = useAccountAction();
function load(event: Event) { if ((event.target as HTMLDetailsElement).open && !providers.value) void perform(signal => apiJson<{ provider: OAuthProvider; configured: boolean }[]>('/auth/oauth/providers', { signal }), result => { providers.value = result; }); }
</script>
<template>
  <details
    class="mt-6 border-t border-slate-200 pt-5"
    @toggle="load"
  >
    <summary class="cursor-pointer text-sm font-medium">
      Connexion avec GitHub ou GitLab
    </summary><p class="field-help mt-3">
      Associez d’abord votre compte externe depuis votre profil CodeAudit. La double authentification reste active.
    </p><p
      v-if="busy"
      role="status"
      class="mt-3 text-sm"
    >
      Chargement des fournisseurs…
    </p><p
      v-if="error"
      role="alert"
      class="notice notice-error mt-3"
    >
      {{ error }}
    </p><ul class="mt-4 space-y-3">
      <li
        v-for="provider in providers"
        :key="provider.provider"
      >
        <a
          v-if="provider.configured"
          :href="`/api/auth/oauth/${provider.provider}/start`"
          class="button-secondary w-full"
        >Continuer avec {{ provider.provider === 'GITHUB' ? 'GitHub' : 'GitLab' }}</a><p
          v-else
          class="text-xs text-slate-500"
        >
          {{ provider.provider === 'GITHUB' ? 'GitHub' : 'GitLab' }} : configuration serveur requise.
        </p>
      </li>
    </ul>
  </details>
</template>
