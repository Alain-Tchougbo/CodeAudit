<script setup lang="ts">
withDefaults(defineProps<{ name: 'code' | 'dashboard' | 'folder' | 'user' | 'logout' | 'arrow' | 'back' | 'plus' | 'search' | 'refresh' | 'upload' | 'download' | 'check' | 'warning' | 'clock' | 'file' | 'filter' | 'shield' | 'cancel'; size?: number }>(), { size: 20 });
const paths = {
  cancel: 'm9 9 6 6m0-6-6 6M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  folder: 'M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  logout: 'M9 4H4v16h5m5-12 4 4-4 4m-5-4h12', arrow: 'M4 12h16m-6-6 6 6-6 6', back: 'M20 12H4m6-6-6 6 6 6',
  plus: 'M12 5v14M5 12h14', search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  refresh: 'M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-2l1.5 2M4 17l1.5 2a8 8 0 0 0 13-2',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5', download: 'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6', warning: 'M12 3 2 21h20L12 3zm0 6v5m0 3v1', clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  file: 'M14 2H4v20h16V8l-6-6zm0 0v6h6M8 13h8m-8 4h6', filter: 'M3 5h18M6 12h12m-8 7h4', shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4zm-4 10 3 3 5-6',
};
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  ><path :d="paths[name]" /></svg>
</template>
