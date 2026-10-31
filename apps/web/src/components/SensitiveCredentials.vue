<script setup lang="ts">
import type { SensitiveCredentials } from '../api/account-security';
defineProps<{ prefix: string; mfa: boolean }>(); const value = defineModel<SensitiveCredentials>({ required: true });
</script>
<template>
  <div class="space-y-4">
    <div>
      <label
        :for="`${prefix}-password`"
        class="field-label"
      >Mot de passe actuel</label><input
        :id="`${prefix}-password`"
        v-model="value.currentPassword"
        class="field"
        type="password"
        required
        minlength="12"
        maxlength="128"
        autocomplete="current-password"
      >
    </div><div v-if="mfa">
      <label
        :for="`${prefix}-code`"
        class="field-label"
      >Code 2FA ou code de secours</label><input
        :id="`${prefix}-code`"
        v-model="value.code"
        class="field font-mono"
        required
        maxlength="40"
        autocomplete="one-time-code"
        spellcheck="false"
        autocapitalize="off"
      ><p class="field-help mt-2">
        Un code déjà utilisé est refusé. Attendez le suivant ou utilisez un code de secours.
      </p>
    </div>
  </div>
</template>
