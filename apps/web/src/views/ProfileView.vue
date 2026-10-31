<script setup lang="ts">
import { authState } from '../auth-state';
</script>
<template>
  <section
    v-if="authState.user.value"
    class="mx-auto max-w-xl"
  >
    <div class="page-heading">
      <h1>Mon profil</h1>
    </div><dl class="panel space-y-5">
      <div>
        <dt class="field-label">
          Nom
        </dt><dd>{{ authState.user.value.name }}</dd>
      </div><div>
        <dt class="field-label">
          Adresse e-mail
        </dt><dd class="break-all">
          {{ authState.user.value.email }}
        </dd>
      </div><div>
        <dt class="field-label">
          Expiration maximale de la session
        </dt><dd>{{ new Date(authState.expiresAt.value).toLocaleString('fr-FR') }}</dd>
      </div>
    </dl>
    <p class="mt-4 text-sm text-slate-600">
      La session expire aussi après 30 minutes sans requête à l’application.
    </p>
  </section>
</template>
