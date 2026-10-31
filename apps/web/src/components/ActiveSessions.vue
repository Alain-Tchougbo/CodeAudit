<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ActiveSession } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { clearSession } from '../auth-state';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
import { date } from '../format';
const router = useRouter();
const { data, loading, error, reload } = useResource(signal => apiJson<ActiveSession[]>('/auth/sessions', { signal }));
const selected = ref<ActiveSession | 'all' | null>(null); const busy = ref(false); const actionError = ref(''); const success = ref('');
async function revoke() {
  if (!selected.value || busy.value) return; const selection = selected.value; busy.value = true; actionError.value = '';
  try {
    await apiJson(selection === 'all' ? '/auth/logout-all' : `/auth/sessions/${encodeURIComponent(selection.id)}`, { method: selection === 'all' ? 'POST' : 'DELETE' });
    selected.value = null;
    if (selection === 'all' || selection.current) { clearSession(); await router.replace({ path: '/login', query: { logout: selection === 'all' ? 'all' : 'current' } }); }
    else { success.value = 'Session révoquée.'; reload(); }
  } catch (cause) { actionError.value = cause instanceof Error ? cause.message : 'Révocation impossible.'; }
  finally { busy.value = false; }
}
</script>
<template>
  <section
    class="mt-9"
    aria-labelledby="sessions-title"
  >
    <div class="section-heading">
      <div>
        <h2 id="sessions-title">
          Sessions actives
        </h2><p class="mt-2 text-xs text-slate-500">
          Les sessions expirées sont exclues. Jusqu’à 100 sessions récentes affichées.
        </p>
      </div><button
        class="button-secondary"
        @click="selected = 'all'"
      >
        Fermer toutes les sessions
      </button>
    </div>
    <ResourceState
      :loading="loading"
      :error="error"
      @retry="reload"
    /><p
      v-if="success"
      role="status"
      class="notice notice-success"
    >
      {{ success }}
    </p><p
      v-if="actionError"
      role="alert"
      class="notice notice-error"
    >
      {{ actionError }}
    </p>
    <div
      v-if="selected"
      class="notice notice-info block"
    >
      <p>{{ selected === 'all' ? 'Fermer toutes vos sessions, y compris celle-ci ?' : selected.current ? 'Fermer la session utilisée sur cet appareil ?' : 'Révoquer cette session ? Son cookie ne donnera plus accès au compte.' }}</p><div class="mt-3 flex flex-wrap gap-3">
        <button
          class="button-primary"
          :disabled="busy"
          @click="revoke"
        >
          {{ busy ? 'Révocation…' : 'Confirmer la révocation' }}
        </button><button
          class="button-secondary"
          :disabled="busy"
          @click="selected = null"
        >
          Annuler
        </button>
      </div>
    </div>
    <ul
      v-if="data && !loading && !error"
      class="table-surface divide-y divide-[#edf0ea]"
    >
      <li
        v-for="session in data"
        :key="session.id"
        class="flex flex-wrap items-center justify-between gap-4 p-5"
      >
        <div class="min-w-0">
          <p class="text-sm font-semibold">
            {{ session.current ? 'Session actuelle' : 'Autre session' }} <span class="ml-2 font-mono text-[10px] font-normal text-slate-500">#{{ session.id.slice(0, 8) }}</span>
          </p><p class="mt-2 text-xs text-slate-500">
            Ouverte le {{ date(session.createdAt) }}
          </p><p class="mt-1 text-xs text-slate-500">
            Dernière requête : {{ date(session.lastSeenAt) }} · Expiration maximale : {{ date(session.expiresAt) }}
          </p>
        </div><button
          class="button-secondary"
          :aria-label="`Révoquer la session ${session.id.slice(0, 8)}`"
          @click="selected = session"
        >
          Révoquer
        </button>
      </li>
    </ul>
  </section>
</template>
