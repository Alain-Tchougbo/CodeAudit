<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authenticate, safeRedirect } from '../auth';
import { authState } from '../auth-state';
const route = useRoute(); const router = useRouter();
const registering = computed(() => route.name === 'register');
const name = ref(''); const email = ref(''); const password = ref(''); const busy = ref(false); const error = ref('');
watch(() => route.name, () => { name.value = ''; email.value = ''; password.value = ''; error.value = ''; });
async function submit() {
  if (busy.value) return; busy.value = true; error.value = '';
  try { await authenticate(registering.value ? 'register' : 'login', { ...(registering.value ? { name: name.value } : {}), email: email.value, password: password.value }); password.value = ''; await router.replace(safeRedirect(route.query.redirect)); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Authentification impossible.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="mx-auto max-w-md">
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Bienvenue sur CodeAudit
        </p><h1>{{ registering ? 'Créer un compte' : 'Connexion' }}</h1>
      </div>
    </div>
    <p
      v-if="route.query.reason === 'expired'"
      role="status"
      class="mb-5 rounded-lg bg-amber-50 p-4 text-amber-900"
    >
      Votre session a expiré. Reconnectez-vous pour continuer.
    </p>
    <p
      v-if="authState.error.value"
      role="alert"
      class="mb-5 text-red-800"
    >
      {{ authState.error.value }}
    </p>
    <form
      method="post"
      class="panel"
      @submit.prevent="submit"
    >
      <fieldset
        :disabled="busy"
        class="space-y-5"
      >
        <div v-if="registering">
          <label
            for="auth-name"
            class="field-label"
          >Nom</label><input
            id="auth-name"
            v-model="name"
            class="field"
            autocomplete="name"
            required
            maxlength="120"
          >
        </div>
        <div>
          <label
            for="auth-email"
            class="field-label"
          >Adresse e-mail</label><input
            id="auth-email"
            v-model="email"
            class="field"
            type="email"
            autocomplete="email"
            required
            maxlength="254"
          >
        </div>
        <div>
          <label
            for="auth-password"
            class="field-label"
          >Mot de passe</label><input
            id="auth-password"
            v-model="password"
            class="field"
            type="password"
            :autocomplete="registering ? 'new-password' : 'current-password'"
            required
            minlength="12"
            maxlength="128"
            aria-describedby="password-help"
          ><p
            id="password-help"
            class="mt-2 text-xs text-slate-500"
          >
            De 12 à 128 caractères.
          </p>
        </div>
        <button
          type="submit"
          class="button-primary w-full"
        >
          {{ busy ? 'Veuillez patienter…' : registering ? 'Créer mon compte' : 'Se connecter' }}
        </button>
      </fieldset>
      <p
        v-if="error"
        role="alert"
        class="mt-5 text-sm text-red-800"
      >
        {{ error }}
      </p>
    </form>
    <p class="mt-6 text-center text-sm text-slate-600">
      {{ registering ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?' }} <RouterLink
        class="font-semibold text-indigo-700 underline"
        :to="{ name: registering ? 'login' : 'register', query: { redirect: route.query.redirect } }"
      >{{ registering ? 'Se connecter' : 'Créer un compte' }}</RouterLink>
    </p>
  </section>
</template>
