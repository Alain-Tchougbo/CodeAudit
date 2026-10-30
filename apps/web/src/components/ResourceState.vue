<script setup lang="ts">
defineProps<{ loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div
    v-if="loading"
    role="status"
    class="panel animate-pulse py-10 text-center text-slate-600"
  >
    Chargement des données…
  </div>
  <div
    v-else-if="error"
    role="alert"
    class="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900"
  >
    <p class="font-medium">
      {{ error }}
    </p>
    <button
      class="button-secondary mt-4"
      @click="$emit('retry')"
    >
      Réessayer
    </button>
  </div>
</template>
