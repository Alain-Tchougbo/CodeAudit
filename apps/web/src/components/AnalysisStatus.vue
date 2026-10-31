<script setup lang="ts">
import type { AnalysisStatus } from '@codeaudit/contracts';
import AppIcon from './AppIcon.vue';
defineProps<{ status: AnalysisStatus }>();
const states = {
  QUEUED: { label: 'En attente', style: 'badge-queued', icon: 'clock' },
  RUNNING: { label: 'En cours', style: 'badge-running', icon: 'refresh' },
  SUCCEEDED: { label: 'Terminée', style: 'badge-success', icon: 'check' },
  FAILED: { label: 'Échec technique', style: 'badge-error', icon: 'warning' },
} as const;
</script>
<template>
  <span
    class="status-badge"
    :class="states[status].style"
  ><AppIcon
    :name="states[status].icon"
    :size="13"
  />{{ states[status].label }}</span>
</template>
