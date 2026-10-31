<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authenticate, safeRedirect } from '../auth';
import { authState } from '../auth-state';
import AppIcon from '../components/AppIcon.vue';
const route = useRoute(); const router = useRouter();
const registering = computed(() => route.name === 'register');
const name = ref(''); const email = ref(''); const password = ref(''); const busy = ref(false); const error = ref(''); const showPassword = ref(false);
watch(() => route.name, () => { name.value = ''; email.value = ''; password.value = ''; error.value = ''; showPassword.value = false; });
async function submit() {
  if (busy.value) return; busy.value = true; error.value = '';
  try { await authenticate(registering.value ? 'register' : 'login', { ...(registering.value ? { name: name.value } : {}), email: email.value, password: password.value }); password.value = ''; await router.replace(safeRedirect(route.query.redirect)); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Authentification impossible.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="auth-layout">
    <section class="auth-form-side">
      <div class="auth-form">
        <p class="eyebrow">
          {{ registering ? 'Un nouvel espace, pour votre code' : 'Heureux de vous retrouver' }}
        </p>
        <h1 class="page-title">
          {{ registering ? 'Créer un compte' : 'Connexion' }}
        </h1>
        <p class="page-description mb-8">
          {{ registering ? 'Commencez à analyser vos projets dans un espace qui vous appartient.' : 'Retrouvez vos projets, vos analyses et les détails qui comptent.' }}
        </p>
        <p
          v-if="route.query.reason === 'expired'"
          role="status"
          class="notice notice-info"
        >
          Votre session a expiré. Reconnectez-vous pour continuer.
        </p>
        <p
          v-if="authState.error.value"
          role="alert"
          class="notice notice-error"
        >
          {{ authState.error.value }}
        </p>
        <form
          method="post"
          :aria-busy="busy"
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
                placeholder="Votre nom"
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
                placeholder="vous@exemple.fr"
                required
                maxlength="254"
              >
            </div>
            <div>
              <label
                for="auth-password"
                class="field-label"
              >Mot de passe</label>
              <div class="relative">
                <input
                  id="auth-password"
                  v-model="password"
                  class="field pr-24"
                  :type="showPassword ? 'text' : 'password'"
                  :autocomplete="registering ? 'new-password' : 'current-password'"
                  required
                  minlength="12"
                  maxlength="128"
                  aria-describedby="password-help"
                ><button
                  type="button"
                  class="absolute inset-y-1 right-1 min-w-20 rounded px-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                  :aria-pressed="showPassword"
                  :aria-label="showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                  @click="showPassword = !showPassword"
                >
                  {{ showPassword ? 'Masquer' : 'Afficher' }}
                </button>
              </div>
              <p
                id="password-help"
                class="field-help"
              >
                De 12 à 128 caractères.
              </p>
            </div>
            <button
              type="submit"
              class="button-primary mt-2 w-full"
            >
              <span
                v-if="busy"
                class="spinner"
                aria-hidden="true"
              />{{ busy ? 'Veuillez patienter…' : registering ? 'Créer mon compte' : 'Se connecter' }}<AppIcon
                v-if="!busy"
                name="arrow"
                :size="17"
              />
            </button>
          </fieldset>
          <p
            v-if="error"
            role="alert"
            class="notice notice-error mt-5"
          >
            {{ error }}
          </p>
        </form>
        <p class="mt-7 text-center text-sm text-slate-600">
          {{ registering ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?' }} <RouterLink
            class="font-semibold text-indigo-700 underline underline-offset-4"
            :to="{ name: registering ? 'login' : 'register', query: { redirect: route.query.redirect } }"
          >{{ registering ? 'Se connecter' : 'Créer un compte' }}</RouterLink>
        </p>
        <p class="mt-10 flex items-center justify-center gap-2 text-xs text-slate-500">
          <AppIcon
            name="shield"
            :size="15"
          />Vos projets restent dans votre espace personnel.
        </p>
      </div>
    </section>
    <aside
      class="auth-story"
      aria-label="À propos de CodeAudit"
    >
      <div class="mb-8 flex items-center gap-3 font-mono text-xs tracking-widest text-[#b4cfbd]">
        <span class="h-px w-8 bg-[#a2cbb0]" />LA CLARTÉ, LIGNE PAR LIGNE
      </div>
      <h2>Du code.<br><span class="text-[#c5f0d5]">De la clarté.</span></h2>
      <p class="mt-6 max-w-sm text-base leading-7 text-[#b9cebf]">
        Comprenez ce qui mérite votre attention. Gardez une trace de ce qui s’améliore.
      </p>
      <div class="auth-story-list">
        <div class="auth-story-step">
          <span class="font-mono text-xs text-[#c5f0d5]">01</span><div>Importez votre projet<small>Une archive ZIP, des sources JavaScript ou TypeScript.</small></div>
        </div>
        <div class="auth-story-step">
          <span class="font-mono text-xs text-[#c5f0d5]">02</span><div>Repérez l’essentiel<small>Des diagnostics précis, une règle et une position dans le code.</small></div>
        </div>
        <div class="auth-story-step">
          <span class="font-mono text-xs text-[#c5f0d5]">03</span><div>Conservez le fil<small>Un historique et des rapports JSON à retrouver à tout moment.</small></div>
        </div>
      </div>
      <div class="mt-10 flex gap-2">
        <span class="rounded border border-[#506a58] px-2 py-1 font-mono text-[10px] text-[#c0d7c7]">JavaScript</span><span class="rounded border border-[#506a58] px-2 py-1 font-mono text-[10px] text-[#c0d7c7]">TypeScript</span><span class="rounded border border-[#506a58] px-2 py-1 font-mono text-[10px] text-[#c0d7c7]">ESLint</span>
      </div>
    </aside>
  </div>
</template>
