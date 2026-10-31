import type { ApiError } from '@codeaudit/contracts';
import { authState, clearSession } from '../auth-state';
export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'ApiRequestError'; }
}
export async function apiResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const sessionVersion = authState.version;
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(options.method ?? 'GET')) {
    headers.set('X-CodeAudit-Request', '1');
    if (authState.csrf.value) headers.set('X-CSRF-Token', authState.csrf.value);
  }
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', headers }); }
  catch (cause) { if (options.signal?.aborted) throw cause; throw new ApiRequestError('Impossible de joindre le serveur. Vérifiez que l’API est démarrée.', 0, 'NETWORK_ERROR'); }
  if (!response.ok) {
    let body: Partial<ApiError> = {};
    try { const parsed: unknown = await response.json(); if (parsed && typeof parsed === 'object') body = parsed as Partial<ApiError>; } catch { /* Non-JSON response. */ }
    if (response.status === 401 && sessionVersion === authState.version && !['/auth/login', '/auth/register'].includes(path)) {
      const wasAuthenticated = !!authState.user.value; clearSession();
      if (wasAuthenticated) window.dispatchEvent(new Event('codeaudit-session-expired'));
    }
    throw new ApiRequestError(body.details?.join(' ') || body.message || 'La requête a échoué. Réessayez.', response.status, body.code ?? 'HTTP_ERROR');
  }
  return response;
}
export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiResponse(path, options);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
