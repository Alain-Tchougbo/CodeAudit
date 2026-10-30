<script setup lang="ts">
import type { AnalysisSummary } from '@codeaudit/contracts';
import AnalysisStatus from './AnalysisStatus.vue';
import { date, duration, number } from '../format';
defineProps<{ analyses: (AnalysisSummary & { projectName?: string })[] }>();
</script>
<template>
  <ul class="divide-y divide-slate-100">
    <li
      v-for="analysis in analyses"
      :key="analysis.id"
    >
      <RouterLink
        :to="`/analyses/${analysis.id}`"
        class="group flex flex-wrap items-center justify-between gap-4 px-5 py-5 transition hover:bg-slate-50"
      >
        <div class="min-w-0 flex-1">
          <p class="break-words font-semibold text-slate-900 group-hover:text-indigo-700">{{ analysis.projectName || 'Analyse du projet' }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ date(analysis.createdAt) }} <span v-if="analysis.startedAt && analysis.finishedAt">· {{ duration(Date.parse(analysis.finishedAt) - Date.parse(analysis.startedAt)) }}</span></p>
          <p
            v-if="analysis.statistics"
            class="mt-2 text-sm text-slate-600"
          >{{ number(analysis.statistics.errorCount) }} erreurs · {{ number(analysis.statistics.warningCount) }} avertissements</p>
        </div>
        <AnalysisStatus :status="analysis.status" />
        <span
          aria-hidden="true"
          class="text-slate-400"
        >→</span>
      </RouterLink>
    </li>
  </ul>
</template>
