<script setup lang="ts">
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
  <form @submit.prevent="submit">
    <p
      v-if="validationError"
      role="alert"
      class="mb-4 text-red-700"
    >
      {{ validationError }}
    </p>
    <fieldset
      :disabled="busy"
      class="space-y-5 disabled:opacity-60"
    >
      <div>
        <label
          for="project-name"
          class="block font-medium"
        >Nom du projet</label>
        <input
          id="project-name"
          v-model="name"
          name="name"
          required
          :maxlength="PROJECT_NAME_MAX_LENGTH"
          class="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2"
          autocomplete="off"
        >
      </div>
      <div>
        <label
          for="project-description"
          class="block font-medium"
        >Description (facultative)</label>
        <textarea
          id="project-description"
          v-model="description"
          name="description"
          :maxlength="PROJECT_DESCRIPTION_MAX_LENGTH"
          rows="5"
          class="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2"
        />
      </div>
      <button
        type="submit"
        class="rounded bg-slate-900 px-4 py-2 font-medium text-white"
      >
        {{ busy ? 'Enregistrement…' : submitLabel }}
      </button>
    </fieldset>
  </form>
</template>
