<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { ref } from 'vue';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type CreateProjectRequest,
  type Project,
} from '@codeaudit/contracts';

const props = defineProps<{
  initialProject?: Project;
  busy: boolean;
  submitLabel: string;
}>();
const emit = defineEmits<{ submit: [input: CreateProjectRequest] }>();
const name = ref(props.initialProject?.name ?? '');
const description = ref(props.initialProject?.description ?? '');
const validationError = ref('');

function submit(): void {
  const cleanName = name.value.trim();
  const cleanDescription = description.value.trim();
  if (!cleanName || cleanName.length > PROJECT_NAME_MAX_LENGTH) {
    validationError.value = 'Le nom doit contenir entre 1 et 120 caractères.';
    return;
  }
  if (cleanDescription.length > PROJECT_DESCRIPTION_MAX_LENGTH) {
    validationError.value = 'La description est limitée à 2 000 caractères.';
    return;
  }
  validationError.value = '';
  emit('submit', { name: cleanName, description: cleanDescription || null });
}
</script>

<template>
  <form
    :aria-busy="busy"
    @submit.prevent="submit"
  >
    <p
      v-if="validationError"
      role="alert"
      class="notice notice-error"
    >
      {{ validationError }}
    </p>
    <fieldset
      :disabled="busy"
      class="space-y-6 disabled:opacity-60"
    >
      <div>
        <label
          for="project-name"
          class="field-label"
        >Nom du projet</label><input
          id="project-name"
          v-model="name"
          name="name"
          required
          :maxlength="PROJECT_NAME_MAX_LENGTH"
          class="field"
          autocomplete="off"
          placeholder="Ex. Application web"
          aria-describedby="project-name-help"
        ><p
          id="project-name-help"
          class="field-help"
        >
          Un nom pour retrouver facilement votre projet. 120 caractères maximum.
        </p>
      </div>
      <div>
        <label
          for="project-description"
          class="field-label"
        >Description (facultative)</label><textarea
          id="project-description"
          v-model="description"
          name="description"
          :maxlength="PROJECT_DESCRIPTION_MAX_LENGTH"
          rows="5"
          class="field resize-y"
          placeholder="À quoi sert ce projet ? Quel est son périmètre ?"
          aria-describedby="project-description-help"
        /><div
          id="project-description-help"
          class="mt-2 flex justify-between gap-3 text-xs text-slate-500"
        >
          <span>Ajoutez un peu de contexte pour vos prochaines analyses.</span><span class="shrink-0 font-mono">{{ description.length }} / 2 000</span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 border-t border-[#e3e9e1] pt-6">
        <button
          type="submit"
          class="button-primary"
        >
          <span
            v-if="busy"
            class="spinner"
            aria-hidden="true"
          /><AppIcon
            v-else
            name="check"
            :size="17"
          />{{ busy ? 'Enregistrement…' : submitLabel }}
        </button>
        <RouterLink
          :to="initialProject ? `/projects/${initialProject.id}` : '/projects'"
          class="text-link"
        >Annuler</RouterLink>
      </div>
    </fieldset>
  </form>
</template>
