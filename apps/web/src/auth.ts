import type { AuthProfile } from '@codeaudit/contracts';
import { apiJson, ApiRequestError } from './api/http';
import { acceptProfile, authState, clearSession } from './auth-state';
let pending: Promise<void> | undefined;
export async function restoreSession(): Promise<void> {
  if (authState.ready.value) return;
  if (pending) return pending;
  const version = authState.version;
  pending = (async () => {
    try { const profile = await apiJson<AuthProfile>('/auth/me'); if (version === authState.version) acceptProfile(profile); }
    catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) { if (!authState.user.value) clearSession(); }
      else { authState.error.value = error instanceof Error ? error.message : 'Serveur indisponible.'; throw error; }
    }
  })().finally(() => { pending = undefined; });
  return pending;
}
export async function authenticate(mode: 'login' | 'register', input: { name?: string; email: string; password: string }) {
  const profile = await apiJson<AuthProfile>(`/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  acceptProfile(profile);
}
export async function logout() { await apiJson<void>('/auth/logout', { method: 'POST' }); clearSession(); }
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/^\/(login|register)([/?#]|$)/.test(value) ? value : '/';
}
