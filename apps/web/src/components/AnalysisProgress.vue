<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisStatus } from '@codeaudit/contracts';
import AppIcon from './AppIcon.vue';
const props = defineProps<{ status: AnalysisStatus }>();
const stage = computed(() => props.status === 'QUEUED' ? 0 : props.status === 'SUCCEEDED' ? 2 : 1);
const steps = computed(() => ['Mise en file', props.status === 'FAILED' ? 'Traitement en échec' : 'Traitement', 'Rapport']);
</script>
<template>
  <ol
    aria-label="Étapes du traitement"
    class="mt-7 grid grid-cols-3 gap-3 border-t border-[#e4e9df] pt-5"
  >
    <li
      v-for="(step, index) in steps"
      :key="index"
      :aria-current="stage === index ? 'step' : undefined"
      class="flex items-center gap-2 text-[11px] sm:gap-3 sm:text-xs"
      :class="index <= stage ? 'text-indigo-800' : 'text-slate-500'"
    >
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px]"
        :class="index === stage && status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-800' : index <= stage ? 'border-[#bdd8c4] bg-[#eef7ec]' : 'border-slate-200'"
      ><AppIcon
        v-if="index < stage || (index === stage && status === 'SUCCEEDED')"
        name="check"
        :size="12"
      /><AppIcon
        v-else-if="index === stage && status === 'FAILED'"
        name="warning"
        :size="12"
      /><span v-else>{{ index + 1 }}</span></span><span>{{ step }}</span>
    </li>
  </ol>
</template>
