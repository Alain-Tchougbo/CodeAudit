import type { AnalysisHistory, AnalysisResults, AnalysisSummary, ApiError, Dashboard } from '@codeaudit/contracts';

async function response(path: string, signal?: AbortSignal, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { ...options, signal }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Impossible de joindre le serveur. Vérifiez que l’API est démarrée.', { cause: error });
  }
  if (!response.ok) {
    let body: Partial<ApiError> = {};
    try { body = await response.json() as Partial<ApiError>; } catch { /* Non-JSON error response. */ }
    throw new Error(body.details?.join(' ') || body.message || 'La requête a échoué. Réessayez.');
  }
  return response;
}
async function get<T>(path: string, signal?: AbortSignal): Promise<T> { return (await response(path, signal)).json() as Promise<T>; }
export const analysesApi = {
  create: async (projectId: string, file: File, signal?: AbortSignal): Promise<AnalysisSummary> => {
    const form = new FormData(); form.append('archive', file);
    return (await response(`/projects/${encodeURIComponent(projectId)}/analyses`, signal, { method: 'POST', body: form })).json() as Promise<AnalysisSummary>;
  },
  export: async (id: string, signal?: AbortSignal) => (await response(`/analyses/${encodeURIComponent(id)}/report`, signal)).blob(),
  dashboard: (signal?: AbortSignal) => get<Dashboard>('/dashboard', signal),
  get: (id: string, signal?: AbortSignal) => get<AnalysisSummary>(`/analyses/${encodeURIComponent(id)}`, signal),
  results: (id: string, signal?: AbortSignal) => get<AnalysisResults>(`/analyses/${encodeURIComponent(id)}/results`, signal),
  history: (projectId: string, cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ limit: '20' });
    if (cursor) query.set('cursor', cursor);
    return get<AnalysisHistory>(`/projects/${encodeURIComponent(projectId)}/analyses?${query}`, signal);
  },
};
