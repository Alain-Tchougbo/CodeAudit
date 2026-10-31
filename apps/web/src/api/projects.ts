import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@codeaudit/contracts';

import { apiJson, ApiRequestError as ProjectApiError } from './http';
export { ProjectApiError };
const request = <T>(path: string, options: RequestInit = {}) => apiJson<T>('/projects'+path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });

export const projectsApi = {
  list: (signal?: AbortSignal) => request<Project[]>('', { signal }),
  get: (id: string, signal?: AbortSignal) => request<Project>(`/${encodeURIComponent(id)}`, { signal }),
  create: (input: CreateProjectRequest) => request<Project>('', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateProjectRequest) =>
    request<Project>(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  delete: (id: string) => request<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
