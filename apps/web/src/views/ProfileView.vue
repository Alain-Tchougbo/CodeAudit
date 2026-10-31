<script setup lang="ts">
import { computed } from 'vue';
import { authState } from '../auth-state';
import AppIcon from '../components/AppIcon.vue';
import ActiveSessions from '../components/ActiveSessions.vue';
import { date } from '../format';
const initials = computed(() => authState.user.value?.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() ?? '');
</script>
<template>
  <section v-if="authState.user.value">
    <div class="page-heading">
      <div>
        <p class="eyebrow">
          Votre compte
        </p><h1>Mon profil</h1><p class="page-description">
          Vos informations personnelles et votre session actuelle.
        </p>
      </div>
    </div>
    <div class="form-layout">
      <div class="panel">
        <div class="mb-7 flex items-center gap-4 border-b border-[#e4e9df] pb-6">
          <span
            class="avatar size-14 text-base"
            aria-hidden="true"
          >{{ initials }}</span><div class="min-w-0">
            <h2 class="break-words text-lg font-semibold">
              {{ authState.user.value.name }}
            </h2><p class="mt-1 text-xs text-slate-500">
              Espace personnel CodeAudit
            </p>
          </div>
        </div>
        <dl class="grid gap-7 sm:grid-cols-2">
          <div>
            <dt class="field-label text-xs">
              Nom
            </dt><dd class="break-words text-sm">
              {{ authState.user.value.name }}
            </dd>
          </div><div>
            <dt class="field-label text-xs">
              Adresse e-mail
            </dt><dd class="break-all text-sm">
              {{ authState.user.value.email }}
            </dd>
          </div><div>
            <dt class="field-label text-xs">
              Compte créé le
            </dt><dd class="text-sm">
              {{ date(authState.user.value.createdAt) }}
            </dd>
          </div><div>
            <dt class="field-label text-xs">
              Expiration maximale de la session
            </dt><dd class="text-sm">
              {{ date(authState.expiresAt.value) }}
            </dd>
          </div>
        </dl>
      </div><aside class="form-aside">
        <span class="empty-icon"><AppIcon
          name="shield"
          :size="24"
        /></span><h2 class="mb-3 font-semibold text-slate-800">
          Une session personnelle
        </h2><p>La session expire aussi après 30 minutes sans requête à l’application.</p><p class="mt-4">
          Utilisez « Se déconnecter » lorsque vous avez terminé sur un poste partagé.
        </p>
      </aside>
    </div>
    <ActiveSessions />
  </section>
</template>
