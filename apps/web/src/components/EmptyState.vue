<script setup lang="ts">
import AppIcon from './AppIcon.vue';
withDefaults(defineProps<{ title: string; description?: string; icon?: 'folder' | 'search' | 'file' | 'check' }>(), { icon: 'folder', description: '' });
</script>
<template>
  <div class="empty-state">
    <span class="empty-icon"><AppIcon
      :name="icon"
      :size="25"
    /></span><h3 class="text-base font-semibold">
      {{ title }}
    </h3><p
      v-if="description"
      class="mt-2 max-w-md text-sm text-slate-600"
    >
      {{ description }}
    </p><div
      v-if="$slots.default"
      class="mt-6"
    >
      <slot />
    </div>
  </div>
</template>
