<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiJson } from '../api/http';
import { clearSession } from '../auth-state';
import AppIcon from '../components/AppIcon.vue';
const route = useRoute(); const router = useRouter();
const forgot = computed(() => route.name === 'forgot-password');
const email = ref(''); const password = ref(''); const confirmation = ref(''); const busy = ref(false); const error = ref(''); const done = ref(false);
const token = computed(() => new URLSearchParams(route.hash.slice(1)).get('token') ?? '');
const validToken = computed(() => /^[a-f0-9]{64}$/.test(token.value));
let revision = 0; let controller = new AbortController();
onScopeDispose(() => controller.abort());
watch([() => route.name, () => route.hash], ([name, hash], [oldName]) => {
  if (name === oldName && name === 'reset-password' && !hash && done.value) return;
  revision++; controller.abort(); controller = new AbortController(); busy.value = false;
  done.value = false; error.value = ''; password.value = ''; confirmation.value = '';
});
async function submit() {
  if (busy.value) return; error.value = '';
  if (!forgot.value && password.value !== confirmation.value) { error.value = 'Les mots de passe ne correspondent pas.'; return; }
  busy.value = true; const current = revision; const signal = controller.signal;
  try {
    if (forgot.value) { await apiJson('/auth/forgot-password', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value }) }); if (current !== revision || signal.aborted) return; }
    else { await apiJson('/auth/reset-password', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.value, password: password.value }) }); if (current !== revision || signal.aborted) return; password.value = ''; confirmation.value = ''; clearSession(); done.value = true; await router.replace({ path: '/reset-password' }); }
    done.value = true;
  } catch (cause) { if (current === revision && !signal.aborted) error.value = cause instanceof Error ? cause.message : 'Opération impossible.'; }
  finally { if (current === revision && !signal.aborted) busy.value = false; }
}
</script>
<template>
  <div class="auth-layout">
    <section class="auth-form-side">
      <div class="auth-form">
        <p class="eyebrow">
          Accès à votre compte
        </p><h1 class="page-title">
          {{ forgot ? 'Mot de passe oublié' : 'Nouveau mot de passe' }}
        </h1>
        <p class="page-description mb-8">
          {{ forgot ? 'Indiquez votre adresse e-mail pour demander un lien de réinitialisation.' : 'Choisissez un mot de passe de 12 à 128 caractères. Cette opération ferme les sessions du compte et vous déconnecte de cet appareil.' }}
        </p>
        <p
          v-if="done"
          role="status"
          class="notice notice-success"
        >
          {{ forgot ? 'Si un compte correspond à cette adresse, un lien de réinitialisation vous sera envoyé. Vérifiez aussi les courriers indésirables.' : 'Votre mot de passe a été modifié. Reconnectez-vous.' }}
        </p>
        <form
          v-else-if="forgot || validToken"
          :aria-busy="busy"
          @submit.prevent="submit"
        >
          <fieldset
            :disabled="busy"
            class="space-y-5"
          >
            <div v-if="forgot">
              <label
                for="recovery-email"
                class="field-label"
              >Adresse e-mail</label><input
                id="recovery-email"
                v-model="email"
                type="email"
                class="field"
                required
                maxlength="254"
                autocomplete="email"
              >
            </div>
            <template v-else>
              <div>
                <label
                  for="recovery-password"
                  class="field-label"
                >Nouveau mot de passe</label><input
                  id="recovery-password"
                  v-model="password"
                  type="password"
                  class="field"
                  required
                  minlength="12"
                  maxlength="128"
                  autocomplete="new-password"
                >
              </div><div>
                <label
                  for="recovery-confirmation"
                  class="field-label"
                >Confirmer le mot de passe</label><input
                  id="recovery-confirmation"
                  v-model="confirmation"
                  type="password"
                  class="field"
                  required
                  minlength="12"
                  maxlength="128"
                  autocomplete="new-password"
                >
              </div>
            </template>
            <button
              type="submit"
              class="button-primary w-full"
            >
              <span
                v-if="busy"
                class="spinner"
                aria-hidden="true"
              />{{ busy ? 'Veuillez patienter…' : forgot ? 'Envoyer le lien' : 'Modifier le mot de passe' }}
            </button>
          </fieldset>
        </form>
        <p
          v-else
          role="alert"
          class="notice notice-error"
        >
          Ouvrez le lien reçu par e-mail. Il est valable 15 minutes et utilisable une seule fois.
        </p>
        <p
          v-if="error"
          role="alert"
          class="notice notice-error mt-5"
        >
          {{ error }}
        </p>
        <RouterLink
          v-if="!forgot && !done"
          to="/forgot-password"
          class="text-link mt-5"
        >Demander un nouveau lien</RouterLink>
        <RouterLink
          to="/login"
          class="back-link mt-7"
        ><AppIcon
          name="back"
          :size="16"
        />Retour à la connexion</RouterLink>
      </div>
    </section><aside class="auth-story">
      <AppIcon
        name="shield"
        :size="38"
        class="mb-8 text-[#c5f0d5]"
      /><h2>Retrouvez<br><span class="text-[#c5f0d5]">votre espace.</span></h2><p class="mt-7 max-w-sm text-sm leading-7 text-[#bfd1c3]">
        Votre mot de passe reste personnel. CodeAudit ne vous le demandera jamais par e-mail.
      </p><p class="mt-6 max-w-sm text-sm leading-7 text-[#bfd1c3]">
        Un lien expiré ? Demandez-en un nouveau depuis cette page.
      </p>
    </aside>
  </div>
</template>
