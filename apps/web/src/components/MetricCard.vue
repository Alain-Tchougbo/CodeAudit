<script setup lang="ts">
import { number } from '../format';
defineProps<{ label: string; value: number; description?: string }>();
</script>
<template>
  <div class="panel">
    <dt class="text-sm font-medium text-slate-600">
      {{ label }}
    </dt>
    <dd class="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
      {{ number(value) }}
    </dd>
    <dd
      v-if="description"
      class="mt-2 text-sm text-slate-500"
    >
      {{ description }}
    </dd>
  </div>
</template>
