<script setup lang="ts">
import type { AccountSecurityState } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
import EmailSecurity from './EmailSecurity.vue';
import PasswordSettings from './PasswordSettings.vue';
import MfaSettings from './MfaSettings.vue';
import OAuthAccounts from './OAuthAccounts.vue';
import PersonalDataControls from './PersonalDataControls.vue';
import SecurityHistory from './SecurityHistory.vue';
const { data, loading, error, reload } = useResource(signal => apiJson<AccountSecurityState>('/auth/security', { signal }));
function enabled(remaining: number) { if (data.value) data.value = { ...data.value, mfa: { ...data.value.mfa, enabled: true, recoveryCodesRemaining: remaining } }; }
</script>
<template>
  <div class="mt-8">
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    /><template v-if="data && !error">
      <EmailSecurity
        :verified-at="data.emailVerifiedAt"
        :mfa="data.mfa.enabled"
      /><PasswordSettings :mfa="data.mfa.enabled" /><MfaSettings
        :enabled="data.mfa.enabled"
        :available="data.mfa.available"
        :remaining="data.mfa.recoveryCodesRemaining"
        :verified="!!data.emailVerifiedAt"
        @updated="enabled"
      /><OAuthAccounts
        :providers="data.providers"
        :identities="data.identities"
        :verified="!!data.emailVerifiedAt"
        :mfa="data.mfa.enabled"
      /><PersonalDataControls :mfa="data.mfa.enabled" />
    </template><SecurityHistory />
  </div>
</template>
