<script setup lang="ts">
import { ref } from 'vue';
import type { AuthProfile } from '@codeaudit/contracts';
import { authState, acceptProfile } from '../auth-state';
import { securityMutation } from '../api/account-security';
import { useAccountAction } from '../composables/useAccountAction';
const name = ref(authState.user.value?.name ?? ''); const { busy, error, message, perform } = useAccountAction();
function save() { void perform(signal => securityMutation<AuthProfile>('profile', { name: name.value.trim() }, signal, 'PATCH'), result => { acceptProfile(result); message.value = 'Profil mis à jour.'; }); }
</script>
<template>
  <section
    class="panel mt-8"
    aria-labelledby="edit-profile-title"
  >
    <h2
      id="edit-profile-title"
      class="font-semibold"
    >
      Modifier mon profil
    </h2><form
      class="mt-5 flex flex-wrap items-end gap-3"
      :aria-busy="busy"
      @submit.prevent="save"
    >
      <div class="min-w-0 flex-1">
        <label
          for="profile-name"
          class="field-label"
        >Nom affiché</label><input
          id="profile-name"
          v-model="name"
          class="field"
          required
          maxlength="120"
          autocomplete="name"
          :disabled="busy"
        >
      </div><button
        class="button-primary"
        :disabled="busy || !name.trim()"
      >
        {{ busy ? 'Enregistrement…' : 'Enregistrer le profil' }}
      </button>
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
