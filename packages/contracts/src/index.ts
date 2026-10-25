export interface HealthResponse {
  status: 'ok';
  service: 'codeaudit-api';
}

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: string[];
  requestId: string;
}

export type AnalysisStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface AnalysisSummary {
  id: string;
  projectId: string;
  status: AnalysisStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  profileVersion: string | null;
  error: { code: string; message: string } | null;
  statistics: {
    analyzedFileCount: number;
    affectedFileCount: number;
    errorCount: number;
    warningCount: number;
    syntaxErrorCount: number;
  } | null;
}
