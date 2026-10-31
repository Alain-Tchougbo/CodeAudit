<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from './auth-state';
import { logout } from './auth';
const router = useRouter(); const route = useRoute(); const leaving = ref(false); const logoutError = ref('');
async function signOut() {
  if (leaving.value) return; leaving.value = true; logoutError.value = '';
  try { await logout(); await router.replace('/login'); }
  catch (error) { logoutError.value = error instanceof Error ? error.message : 'Déconnexion impossible. Réessayez.'; }
  finally { leaving.value = false; }
}
</script>
<template>
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-4"
  >Aller au contenu</a>
  <header class="border-b border-slate-200 bg-white">
    <nav
      class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6"
      aria-label="Navigation principale"
    >
      <RouterLink
        to="/"
        class="text-xl font-bold tracking-tight text-indigo-950"
      >CodeAudit</RouterLink>
      <div
        v-if="authState.user.value"
        class="flex flex-wrap items-center gap-2 text-sm font-medium"
      >
        <RouterLink
          to="/"
          exact-active-class="bg-indigo-50 text-indigo-800"
          class="rounded-lg px-3 py-2"
        >Tableau de bord</RouterLink>
        <RouterLink
          to="/projects"
          active-class="bg-indigo-50 text-indigo-800"
          class="rounded-lg px-3 py-2"
        >Projets</RouterLink>
        <RouterLink
          to="/profile"
          class="rounded-lg px-3 py-2"
        >Mon profil</RouterLink>
        <button
          class="button-secondary"
          :disabled="leaving"
          @click="signOut"
        >
          {{ leaving ? 'Déconnexion…' : 'Se déconnecter' }}
        </button>
      </div>
    </nav>
  </header>
  <main
    id="main-content"
    class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10"
  >
    <p
      v-if="logoutError"
      role="alert"
      class="mb-5 text-red-800"
    >
      {{ logoutError }}
    </p>
    <RouterView v-if="route.meta.public || authState.user.value" />
    <p
      v-else
      role="status"
    >
      Vérification de votre session…
    </p>
  </main>
</template>
