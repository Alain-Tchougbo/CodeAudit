import type { AnalysisCodeContext, AnalysisComparison, AnalysisHistory, AnalysisResults, AnalysisSummary, Dashboard } from '@codeaudit/contracts';

import { apiResponse } from './http';
const response = (path: string, signal?: AbortSignal, options: RequestInit = {}) => apiResponse(path, { ...options, signal });
async function get<T>(path: string, signal?: AbortSignal): Promise<T> { return (await response(path, signal)).json() as Promise<T>; }
export const analysesApi = {
  cancel: async (id: string, signal?: AbortSignal): Promise<AnalysisSummary> => (await response(`/analyses/${encodeURIComponent(id)}/cancel`, signal, { method: 'POST' })).json() as Promise<AnalysisSummary>,
  create: async (projectId: string, file: File, signal?: AbortSignal, options: { captureContext?: boolean } = {}): Promise<AnalysisSummary> => {
    const form = new FormData(); form.append('archive', file);
    if (options.captureContext) form.append('captureContext', 'true');
    return (await response(`/projects/${encodeURIComponent(projectId)}/analyses`, signal, { method: 'POST', body: form })).json() as Promise<AnalysisSummary>;
  },
  export: async (id: string, signal?: AbortSignal) => (await response(`/analyses/${encodeURIComponent(id)}/report`, signal)).blob(),
  context: (id: string, signal?: AbortSignal) => get<AnalysisCodeContext>(`/analyses/${encodeURIComponent(id)}/context`, signal),
  deleteContext: async (id: string, signal?: AbortSignal) => { await response(`/analyses/${encodeURIComponent(id)}/context`, signal, { method: 'DELETE' }); },
  dashboard: (signal?: AbortSignal) => get<Dashboard>('/dashboard', signal),
  get: (id: string, signal?: AbortSignal) => get<AnalysisSummary>(`/analyses/${encodeURIComponent(id)}`, signal),
  results: (id: string, signal?: AbortSignal) => get<AnalysisResults>(`/analyses/${encodeURIComponent(id)}/results`, signal),
  compare: (targetId: string, baselineId: string, signal?: AbortSignal) => get<AnalysisComparison>(`/analyses/${encodeURIComponent(targetId)}/comparison?${new URLSearchParams({ baselineId })}`, signal),
  history: (projectId: string, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor', cursor);
    return get<AnalysisHistory>(`/projects/${encodeURIComponent(projectId)}/analyses?${query}`, signal);
  },
};
