<script setup lang="ts">
import AppIcon from './AppIcon.vue';
defineProps<{ loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div
    v-if="loading"
    role="status"
    class="panel flex items-center gap-4 py-10 text-sm text-slate-600"
  >
    <span
      class="spinner text-indigo-700"
      aria-hidden="true"
    /><div>
      <p class="font-medium text-slate-800">
        Chargement des données…
      </p><p class="mt-1 text-xs">
        Nous préparons votre espace de travail.
      </p>
    </div>
  </div>
  <div
    v-else-if="error"
    role="alert"
    class="notice notice-error flex-wrap items-center justify-between gap-5"
  >
    <div class="flex items-start gap-3">
      <AppIcon
        name="warning"
        :size="19"
      /><p class="font-medium">
        {{ error }}
      </p>
    </div><button
      class="button-secondary shrink-0"
      @click="$emit('retry')"
    >
      <AppIcon
        name="refresh"
        :size="16"
      />Réessayer
    </button>
  </div>
</template>
