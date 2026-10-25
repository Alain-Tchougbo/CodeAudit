import { ref, shallowRef, watch } from 'vue';

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, key: () => string = () => '') {
  const data = shallowRef<T | null>(null);
  const loading = ref(true);
  const error = ref('');
  const revision = ref(0);

  watch([key, revision], async (_value, _previous, onCleanup) => {
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loading.value = true;
    error.value = '';
    data.value = null;
    try {
      const result = await load(controller.signal);
      if (!controller.signal.aborted) data.value = result;
    } catch (cause) {
      if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Une erreur est survenue.';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  }, { immediate: true });

  return { data, loading, error, reload: () => { revision.value++; } };
}
