import type { ApiError, CreateProjectRequest, Project, UpdateProjectRequest } from '@codeaudit/contracts';

export class ProjectApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'ProjectApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/projects${path}`, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ProjectApiError('Impossible de joindre le serveur. Vérifiez que l’API est démarrée.', 0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    let body: Partial<ApiError> = {};
    try { body = await response.json() as Partial<ApiError>; } catch { /* Réponse HTTP sans JSON. */ }
    throw new ProjectApiError(
      body.details?.join(' ') || body.message || 'La requête a échoué. Réessayez.',
      response.status,
      body.code ?? 'HTTP_ERROR',
    );
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export const projectsApi = {
  list: (signal?: AbortSignal) => request<Project[]>('', { signal }),
  get: (id: string, signal?: AbortSignal) => request<Project>(`/${encodeURIComponent(id)}`, { signal }),
  create: (input: CreateProjectRequest) => request<Project>('', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateProjectRequest) =>
    request<Project>(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  delete: (id: string) => request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
