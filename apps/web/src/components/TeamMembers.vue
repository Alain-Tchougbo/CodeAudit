<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { TeamMember, TeamRole } from '@codeaudit/contracts';
import { teamsApi, teamRoleLabel } from '../api/teams';
const props = defineProps<{ teamId: string; members: TeamMember[]; viewerId: string; admin: boolean }>(); const emit = defineEmits<{ updated: []; left: [] }>();
const roles = ref<Record<string, TeamRole>>({}); watch(() => props.members, members => { roles.value = Object.fromEntries(members.map(member => [member.userId, member.role])); }, { immediate: true });
const selected = ref<{ member: TeamMember; role: TeamRole | null } | null>(null); const busy = ref(false); const error = ref(''); const panel = ref<HTMLElement>();
watch(selected, async value => { if (value) { await nextTick(); panel.value?.focus(); } });
async function apply() {
  if (!selected.value || busy.value) return; busy.value = true; error.value = ''; const action = selected.value;
  try { await teamsApi.membership(props.teamId, action.member.userId, action.role); selected.value = null; if (action.role === null && action.member.userId === props.viewerId) emit('left'); else emit('updated'); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Modification impossible.'; } finally { busy.value = false; }
}
</script>
<template>
  <section
    class="mt-8"
    aria-labelledby="members-title"
  >
    <div class="section-heading">
      <div>
        <h2 id="members-title">
          Membres
        </h2><p class="field-help">
          Membre : analyse et modification. Lecture seule : consultation. Administrateur : réglages, suppressions et invitations.
        </p>
      </div>
    </div>
    <section
      v-if="selected"
      ref="panel"
      tabindex="-1"
      aria-label="Confirmer la modification du membre"
      class="notice notice-warning block"
      @keydown.esc="selected = null"
    >
      <p class="font-semibold">
        {{ selected.role === null ? `Retirer ${selected.member.name} de l’équipe ?` : `Attribuer le rôle ${teamRoleLabel[selected.role]} à ${selected.member.name} ?` }}
      </p><p class="mt-2 text-sm">
        Les clés CI de cette personne pour les projets de l’équipe seront révoquées, ainsi que ses invitations encore en attente. Le dernier administrateur doit rester en place.
      </p><div class="mt-4 flex flex-wrap gap-3">
        <button
          class="button-danger"
          :disabled="busy"
          @click="apply"
        >
          Confirmer la modification du membre
        </button><button
          class="button-secondary"
          :disabled="busy"
          @click="selected = null"
        >
          Annuler
        </button>
      </div>
    </section>
    <p
      v-if="error"
      role="alert"
      class="notice notice-error"
    >
      {{ error }}
    </p>
    <ul class="table-surface divide-y divide-slate-100">
      <li
        v-for="member in members"
        :key="member.userId"
        class="flex flex-wrap items-center justify-between gap-4 p-5"
      >
        <div class="min-w-0">
          <p class="break-words text-sm font-semibold">
            {{ member.name }} <span
              v-if="member.userId === viewerId"
              class="text-xs font-normal text-slate-500"
            >(vous)</span>
          </p><p
            v-if="member.email"
            class="mt-1 break-all text-xs text-slate-500"
          >
            {{ member.email }}
          </p><p class="mt-2 text-xs text-slate-500">
            {{ teamRoleLabel[member.role] }}
          </p>
        </div><div class="flex min-w-0 flex-wrap items-center gap-2">
          <template v-if="admin">
            <select
              v-model="roles[member.userId]"
              class="field w-auto max-w-full text-xs"
              :aria-label="`Rôle de ${member.name} ${member.userId.slice(0, 8)}`"
              :disabled="busy"
            >
              <option value="ADMIN">
                Administrateur
              </option><option value="MEMBER">
                Membre
              </option><option value="READER">
                Lecture seule
              </option>
            </select><button
              class="button-secondary"
              :disabled="busy || roles[member.userId] === member.role"
              :aria-label="`Modifier le rôle de ${member.name} ${member.userId.slice(0, 8)}`"
              @click="selected = { member, role: roles[member.userId] ?? member.role }"
            >
              Modifier
            </button>
          </template><button
            v-if="admin || member.userId === viewerId"
            class="button-secondary"
            :disabled="busy"
            :aria-label="`Retirer ${member.name} ${member.userId.slice(0, 8)}`"
            @click="selected = { member, role: null }"
          >
            {{ member.userId === viewerId ? 'Quitter' : 'Retirer' }}
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
