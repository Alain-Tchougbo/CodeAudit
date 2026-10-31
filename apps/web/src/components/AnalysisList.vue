<script setup lang="ts">
import type { AnalysisSummary } from '@codeaudit/contracts';
import AnalysisStatus from './AnalysisStatus.vue';
import AppIcon from './AppIcon.vue';
import { date, duration, number } from '../format';
withDefaults(defineProps<{ analyses: (AnalysisSummary & { projectName?: string })[]; selectable?: boolean; selectedIds?: string[] }>(), { selectable: false, selectedIds: () => [] });
defineEmits<{ toggle: [analysis: AnalysisSummary] }>();
</script>
<template>
  <ul class="divide-y divide-[#edf0ea]">
    <li
      v-for="analysis in analyses"
      :key="analysis.id"
      class="flex"
    >
      <label
        v-if="selectable"
        class="flex w-12 shrink-0 items-start justify-center pt-5"
      >
        <span class="flex size-11 items-center justify-center">
          <input
            type="checkbox"
            class="size-4 accent-[#176448]"
            :checked="selectedIds.includes(analysis.id)"
            :disabled="analysis.status !== 'SUCCEEDED' || (selectedIds.length >= 2 && !selectedIds.includes(analysis.id))"
            :aria-label="`Sélectionner l’analyse ${analysis.id.slice(0, 8)} du ${date(analysis.createdAt)}`"
            @change="$emit('toggle', analysis)"
          >
        </span>
      </label>
      <RouterLink
        :to="`/analyses/${analysis.id}`"
        class="group flex min-w-0 flex-1 flex-wrap items-center justify-between gap-4 px-5 py-5 transition hover:bg-[#fbfcf9]"
      >
        <div class="flex min-w-0 flex-1 items-start gap-3"><span class="mt-1 hidden size-9 shrink-0 items-center justify-center rounded-md border border-[#e4e9df] text-[#6b8070] sm:flex"><AppIcon
          name="file"
          :size="17"
        /></span><div class="min-w-0"><p class="break-words text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{{ analysis.projectName || analysis.projectSnapshot?.name || 'Analyse du projet' }}</p><p class="mt-1 text-xs leading-6 text-slate-500">{{ date(analysis.createdAt) }} <span class="px-1">·</span> Durée : {{ analysis.startedAt && analysis.finishedAt ? duration(Date.parse(analysis.finishedAt) - Date.parse(analysis.startedAt)) : '—' }}</p><p class="mt-1.5 font-mono text-[10px] text-slate-500">#{{ analysis.id.slice(0, 8) }}</p></div></div>
        <div class="flex flex-wrap items-center gap-4"><p
          v-if="analysis.statistics"
          class="hidden text-right text-xs text-slate-600 sm:block"
        ><span :class="analysis.statistics.errorCount ? 'text-[#aa342c]' : ''">{{ number(analysis.statistics.errorCount) }} erreurs</span><br><span class="mt-1 inline-block">{{ number(analysis.statistics.warningCount) }} avertissements</span></p><AnalysisStatus :status="analysis.status" /><AppIcon
          name="arrow"
          :size="16"
          class="hidden text-slate-400 sm:block"
        /></div>
      </RouterLink>
    </li>
  </ul>
</template>
