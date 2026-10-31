<script setup lang="ts">
import { number } from '../format';
withDefaults(defineProps<{ label: string; value: number; description?: string; tone?: 'default' | 'error' | 'warning' | 'success' }>(), { tone: 'default', description: '' });
</script>
<template>
  <div class="metric">
    <dt>{{ label }}</dt><dd
      class="metric-value"
      :class="{ 'text-[#aa342c]': tone === 'error', 'text-[#85591b]': tone === 'warning', 'text-[#286344]': tone === 'success' }"
    >
      {{ number(value) }}
    </dd><dd
      v-if="description"
      class="metric-note"
    >
      {{ description }}
    </dd>
  </div>
</template>
