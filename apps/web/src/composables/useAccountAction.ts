import { onScopeDispose, ref } from 'vue';
import { authState } from '../auth-state';
export function useAccountAction() {
  const busy = ref(false); const error = ref(''); const message = ref(''); const controller = new AbortController();
  onScopeDispose(() => controller.abort());
  async function perform<T>(action: (signal: AbortSignal) => Promise<T>, success: (value: T) => void | Promise<void>) {
    if (busy.value) return; const version = authState.version; busy.value = true; error.value = ''; message.value = '';
    try { const result = await action(controller.signal); if (!controller.signal.aborted && version === authState.version) await success(result); }
    catch (cause) { if (!controller.signal.aborted && version === authState.version) error.value = cause instanceof Error ? cause.message : 'Opération impossible.'; }
    finally { if (!controller.signal.aborted) busy.value = false; }
  }
  return { busy, error, message, perform };
}
