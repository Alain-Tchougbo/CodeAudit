<script setup lang="ts">
import type { AnalysisStatus } from '@codeaudit/contracts';
defineProps<{ status: AnalysisStatus }>();
const states = {
  QUEUED: { label: 'En attente', style: 'bg-slate-100 text-slate-700 ring-slate-200' },
  RUNNING: { label: 'En cours', style: 'bg-blue-50 text-blue-800 ring-blue-200' },
  SUCCEEDED: { label: 'Terminée', style: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  FAILED: { label: 'Échec technique', style: 'bg-red-50 text-red-800 ring-red-200' },
};
</script>
<template>
  <span
    class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset"
    :class="states[status].style"
  >
    <span
      aria-hidden="true"
      class="h-1.5 w-1.5 rounded-full bg-current"
    />{{ states[status].label }}
  </span>
</template>
