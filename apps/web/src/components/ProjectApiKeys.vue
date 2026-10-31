<script setup lang="ts">
import { nextTick, onScopeDispose, ref, watch } from 'vue';
import type { ApiKeyCreated, ApiKeySummary } from '@codeaudit/contracts';
import { apiJson } from '../api/http';
import { useResource } from '../composables/useResource';
import ResourceState from './ResourceState.vue';
import { date } from '../format';
const props = defineProps<{ projectId: string }>();
const { data, loading, error, reload } = useResource(signal => apiJson<ApiKeySummary[]>(`/projects/${encodeURIComponent(props.projectId)}/api-keys`, { signal }), () => props.projectId);
const name = ref(''); const days = ref(30); const secret = ref(''); const busy = ref(false); const selected = ref<ApiKeySummary | null>(null); const actionError = ref(''); const feedback = ref('');
const confirmation = ref<HTMLElement>(); const secretField = ref<HTMLInputElement>(); const trigger = ref<HTMLButtonElement | null>(null);
watch(selected, async value => { await nextTick(); if (value) confirmation.value?.focus(); else trigger.value?.focus(); });
watch(secret, async value => { if (value) { await nextTick(); secretField.value?.focus(); } });
let controller = new AbortController(); onScopeDispose(() => { controller.abort(); secret.value = ''; });
watch(() => props.projectId, () => { controller.abort(); controller = new AbortController(); busy.value = false; name.value = ''; days.value = 30; secret.value = ''; selected.value = null; feedback.value = ''; actionError.value = ''; });
async function create() {
  if (busy.value) return; busy.value = true; actionError.value = ''; feedback.value = ''; secret.value = ''; const signal = controller.signal;
  try { const result = await apiJson<ApiKeyCreated>(`/projects/${encodeURIComponent(props.projectId)}/api-keys`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.value.trim(), expiresInDays: days.value }) }); if (!signal.aborted) { secret.value = result.token; name.value = ''; reload(); } }
  catch (cause) { if (!signal.aborted) actionError.value = cause instanceof Error ? cause.message : 'Création impossible.'; }
  finally { if (!signal.aborted) busy.value = false; }
}
async function revoke() {
  if (!selected.value || busy.value) return; busy.value = true; actionError.value = ''; const signal = controller.signal;
  try { await apiJson(`/projects/${encodeURIComponent(props.projectId)}/api-keys/${encodeURIComponent(selected.value.id)}`, { method: 'DELETE', signal }); if (!signal.aborted) { selected.value = null; feedback.value = 'Clé révoquée.'; secret.value = ''; reload(); } }
  catch (cause) { if (!signal.aborted) actionError.value = cause instanceof Error ? cause.message : 'Révocation impossible.'; }
  finally { if (!signal.aborted) busy.value = false; }
}
</script>
<template>
  <section
    class="panel mt-5"
    aria-labelledby="api-keys-title"
  >
    <details>
      <summary class="cursor-pointer">
        <span
          id="api-keys-title"
          class="font-semibold"
        >Intégration CI · Clés personnelles</span>
      </summary>
      <p class="mt-4 text-sm text-slate-600">
        Ces clés permettent uniquement de demander une analyse ZIP et de consulter ses résultats sur ce projet. Elles expirent après 1 à 90 jours ; une réinitialisation du mot de passe les révoque.
      </p>
      <ResourceState
        :loading="loading"
        :error="error"
        @retry="reload"
      />
      <form
        class="mt-5"
        :aria-busy="busy"
        @submit.prevent="create"
      >
        <fieldset
          :disabled="busy"
          class="grid gap-4 sm:grid-cols-2"
        >
          <div>
            <label
              for="api-key-name"
              class="field-label"
            >Nom de la clé CI</label><input
              id="api-key-name"
              v-model="name"
              class="field"
              required
              maxlength="80"
              placeholder="Ex. Workflow de validation"
            >
          </div><div>
            <label
              for="api-key-days"
              class="field-label"
            >Validité en jours</label><input
              id="api-key-days"
              v-model.number="days"
              class="field"
              type="number"
              min="1"
              max="90"
              required
            >
          </div><button
            type="submit"
            class="button-secondary justify-self-start"
          >
            {{ busy ? 'Veuillez patienter…' : 'Créer une clé CI' }}
          </button>
        </fieldset>
      </form>
      <div
        v-if="secret"
        class="notice notice-warning block mt-5"
      >
        <p class="font-semibold">
          Copiez cette clé maintenant : elle ne sera plus affichée.
        </p><label
          for="api-key-secret"
          class="field-label mt-4"
        >Clé secrète générée</label><input
          id="api-key-secret"
          ref="secretField"
          :value="secret"
          readonly
          autocomplete="off"
          spellcheck="false"
          class="field font-mono text-xs"
          @focus="($event.target as HTMLInputElement).select()"
        ><p class="mt-3 text-sm">
          Placez-la dans CODEAUDIT_TOKEN côté CI. Elle n’est conservée qu’en mémoire dans cet écran.
        </p><button
          class="button-secondary mt-3"
          @click="secret = ''"
        >
          Masquer la clé
        </button>
      </div>
      <div
        v-if="selected"
        ref="confirmation"
        tabindex="-1"
        role="region"
        aria-label="Confirmer la révocation de clé"
        class="notice notice-warning block mt-5"
        @keydown.esc="selected = null"
      >
        <p>Révoquer « {{ selected.name }} » ? Les nouvelles requêtes utilisant cette clé seront refusées.</p><div class="mt-3 flex flex-wrap gap-3">
          <button
            class="button-danger"
            :disabled="busy"
            @click="revoke"
          >
            Confirmer la révocation de clé
          </button><button
            class="button-secondary"
            :disabled="busy"
            @click="selected = null"
          >
            Annuler
          </button>
        </div>
      </div>
      <p
        v-if="actionError"
        role="alert"
        class="notice notice-error mt-4"
      >
        {{ actionError }}
      </p><p
        v-if="feedback"
        role="status"
        class="notice notice-success mt-4"
      >
        {{ feedback }}
      </p>
      <ul
        v-if="data && !error && !loading"
        class="mt-5 divide-y divide-slate-100"
      >
        <li
          v-for="key in data"
          :key="key.id"
          class="flex flex-wrap items-center justify-between gap-3 py-4"
        >
          <div class="min-w-0">
            <p class="break-words text-sm font-semibold">
              {{ key.name }}
            </p><p class="mt-1 text-xs text-slate-500">
              Expire le {{ date(key.expiresAt) }} · {{ key.lastUsedAt ? `Dernière utilisation : ${date(key.lastUsedAt)}` : 'Jamais utilisée' }}
            </p>
          </div><button
            class="button-secondary"
            :aria-label="`Révoquer la clé ${key.name}`"
            :disabled="busy"
            @click="trigger = $event.currentTarget as HTMLButtonElement; selected = key"
          >
            Révoquer
          </button>
        </li>
      </ul>
      <p
        v-if="data?.length === 0 && !loading && !error"
        class="mt-5 text-sm text-slate-500"
      >
        Aucune clé active pour ce projet.
      </p>
    </details>
  </section>
</template>
