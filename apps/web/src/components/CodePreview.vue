<script setup lang="ts">
import { computed } from 'vue';
import type { AnalysisCodeContext } from '@codeaudit/contracts';
import { highlight } from '../highlight';
const props = defineProps<{ filePath: string; line: number | null; data: AnalysisCodeContext | null; loading: boolean; error: string }>();
const emit = defineEmits<{ open: [] }>();
const lines = computed(() => props.line === null ? [] : (props.data?.context?.snippets.find(item => item.filePath === props.filePath)?.lines ?? []).filter(line => Math.abs(line.number - props.line!) <= 3));
function toggle(event: Event) { if ((event.target as HTMLDetailsElement).open && props.line !== null) emit('open'); }
const colors = { plain: 'text-slate-800', comment: 'text-slate-500', string: 'text-amber-800', number: 'text-blue-800', keyword: 'text-violet-800' };
</script>
<template>
  <details
    class="mt-3 min-w-0 rounded border border-[#dfe5df] bg-[#fafcf8] text-xs"
    @toggle="toggle"
  >
    <summary class="cursor-pointer px-3 py-2.5 font-semibold text-indigo-700">
      Voir le code
    </summary>
    <p
      v-if="line === null"
      class="px-3 pb-3 text-slate-600"
    >
      Le moteur ne fournit pas de position pour ce diagnostic.
    </p>
    <p
      v-else-if="loading"
      role="status"
      class="px-3 pb-3 text-slate-600"
    >
      Chargement de l’extrait…
    </p>
    <div
      v-else-if="error"
      role="alert"
      class="px-3 pb-3 text-red-800"
    >
      <p>{{ error }}</p><button
        class="text-link mt-2 text-xs"
        @click="emit('open')"
      >
        Réessayer
      </button>
    </div>
    <p
      v-else-if="data && !data.context"
      class="px-3 pb-3 text-slate-600"
    >
      Aucun extrait conservé pour cette analyse. Cette option doit être activée avant le lancement ; les sources temporaires ont été supprimées.
    </p>
    <p
      v-else-if="data && !lines.length"
      class="px-3 pb-3 text-slate-600"
    >
      Extrait indisponible : limite de conservation atteinte ou source non lisible.
    </p>
    <div
      v-else-if="lines.length"
      class="max-w-full overflow-x-auto border-t border-[#dfe5df] py-2"
      role="region"
      :aria-label="`Extrait de ${filePath}`"
      tabindex="0"
    >
      <code class="block min-w-max font-mono text-[11px] leading-6"><template
        v-for="(sourceLine, index) in lines"
        :key="sourceLine.number"
      ><span
        v-if="index && sourceLine.number > lines[index - 1]!.number + 1"
        class="block px-4 text-slate-500"
      >…</span><span
        class="grid grid-cols-[2.5rem_1fr] gap-2 pr-4"
        :class="sourceLine.number === line ? 'bg-[#e5efdc]' : ''"
      ><span
        class="select-none pr-2 text-right text-slate-500"
        aria-hidden="true"
      >{{ sourceLine.number }}</span><span class="whitespace-pre"><span class="sr-only">Ligne {{ sourceLine.number }} : </span><span
        v-for="(token, tokenIndex) in highlight(sourceLine.text)"
        :key="tokenIndex"
        :class="colors[token.kind]"
      >{{ token.text }}</span><span
        v-if="sourceLine.truncated"
        class="text-slate-500"
      >… (ligne tronquée)</span></span></span></template></code>
    </div>
  </details>
</template>
