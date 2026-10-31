import { apiJson, apiResponse } from './http';
export interface SensitiveCredentials { currentPassword: string; code: string }
export const emptyCredentials = (): SensitiveCredentials => ({ currentPassword: '', code: '' });
export const jsonRequest = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function credentialsBody(value: SensitiveCredentials) { return { currentPassword: value.currentPassword, ...(value.code.trim() ? { code: value.code.trim().toLowerCase() } : {}) }; }
export const securityMutation = <T>(path: string, body: unknown, signal?: AbortSignal, method = 'POST') => apiJson<T>(`/auth/${path}`, jsonRequest(method, body, signal));
export async function downloadPersonalData(credentials: SensitiveCredentials, signal: AbortSignal) {
  const response = await apiResponse('/auth/data-export', jsonRequest('POST', credentialsBody(credentials), signal)); return response.blob();
}
