<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authState } from './auth-state';
import { logout } from './auth';
import AppIcon from './components/AppIcon.vue';
const router = useRouter(); const route = useRoute(); const leaving = ref(false); const logoutError = ref('');
const initials = computed(() => authState.user.value?.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() ?? '');
const section = computed(() => route.path === '/login' ? 'Connexion' : route.path === '/register' ? 'Créer un compte' : route.path.startsWith('/projects') ? 'Projets' : route.path.startsWith('/analyses') ? 'Analyses' : route.path === '/profile' ? 'Mon profil' : 'Tableau de bord');
watch(section, (title) => { document.title = `${title} · CodeAudit`; }, { immediate: true });
watch(() => route.path, async () => { await nextTick(); document.getElementById('main-content')?.focus({ preventScroll: true }); });
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
    class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-white focus:p-4"
  >Aller au contenu</a>
  <div
    v-if="route.meta.public"
    class="auth-shell"
  >
    <header class="auth-header">
      <RouterLink
        to="/"
        class="brand"
        aria-label="CodeAudit, accueil"
      ><span class="brand-mark"><AppIcon
        name="code"
        :size="23"
      /></span>CodeAudit<span class="ml-1 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-wide text-slate-500">LOCAL</span></RouterLink>
    </header>
    <main
      id="main-content"
      tabindex="-1"
    >
      <RouterView />
    </main>
  </div>
  <div v-else>
    <aside class="workspace-sidebar">
      <RouterLink
        to="/"
        class="brand px-3"
        aria-label="CodeAudit, accueil"
      ><span class="brand-mark"><AppIcon
        name="code"
        :size="23"
      /></span>CodeAudit</RouterLink>
      <p class="sidebar-label">
        ESPACE DE TRAVAIL
      </p>
      <nav
        class="workspace-nav"
        aria-label="Navigation principale"
      >
        <RouterLink
          to="/"
          class="nav-item"
          exact-active-class="is-active"
        ><AppIcon
          name="dashboard"
          :size="18"
        />Tableau de bord</RouterLink>
        <RouterLink
          to="/projects"
          class="nav-item"
          :class="{ 'is-active': route.path.startsWith('/projects') || route.path.startsWith('/analyses') }"
        ><AppIcon
          name="folder"
          :size="18"
        />Projets</RouterLink>
        <RouterLink
          to="/profile"
          class="nav-item"
          active-class="is-active"
        ><AppIcon
          name="user"
          :size="18"
        />Mon profil</RouterLink>
      </nav>
      <div class="sidebar-foot">
        <p class="mb-2 text-xs font-medium text-emerald-100">
          Votre code, votre espace.
        </p><p class="text-xs leading-6 text-[#a5bcae]">
          Analyse statique JavaScript<br>et TypeScript.
        </p><span class="mt-5 inline-block rounded border border-[#48624f] px-2 py-1 font-mono text-[10px] text-[#bad1c0]">JS / TS</span>
      </div>
    </aside>
    <div class="workspace-body">
      <header class="workspace-topbar">
        <div class="flex min-w-0 items-center gap-3">
          <span class="hidden sm:inline">Espace personnel</span><span class="hidden text-slate-300 sm:inline">/</span><span class="truncate font-medium text-slate-700">{{ section }}</span>
        </div>
        <div
          v-if="authState.user.value"
          class="flex shrink-0 items-center gap-3"
        >
          <span class="hidden max-w-40 truncate text-slate-700 sm:block">{{ authState.user.value.name }}</span><span
            class="avatar"
            aria-hidden="true"
          >{{ initials }}</span><button
            class="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-slate-100"
            :disabled="leaving"
            @click="signOut"
          >
            <AppIcon
              name="logout"
              :size="16"
            /><span>{{ leaving ? 'Déconnexion…' : 'Se déconnecter' }}</span>
          </button>
        </div>
      </header>
      <main
        id="main-content"
        class="workspace-main"
        tabindex="-1"
      >
        <p
          v-if="logoutError"
          role="alert"
          class="notice notice-error"
        >
          {{ logoutError }}
        </p>
        <RouterView v-if="authState.user.value" />
        <p
          v-else
          role="status"
          class="flex items-center gap-3 py-12 text-sm"
        >
          <span
            class="spinner"
            aria-hidden="true"
          />Vérification de votre session…
        </p>
      </main>
      <footer class="app-footer">
        <span>CODEAUDIT / ANALYSE STATIQUE</span><span class="hidden sm:inline">JavaScript &amp; TypeScript</span>
      </footer>
    </div>
  </div>
</template>
