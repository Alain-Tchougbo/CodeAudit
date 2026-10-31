export interface HealthResponse {
  status: 'ok';
  service: 'codeaudit-api';
}

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;
export const ANALYSIS_ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
export interface AuthUser { id: string; name: string; email: string; createdAt: string }
export interface AuthProfile { user: AuthUser; csrfToken: string; expiresAt: string }

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
  projectSnapshot?: ProjectSnapshot | null;
  error: { code: string; message: string } | null;
  statistics: {
    analyzedFileCount: number;
    affectedFileCount: number;
    errorCount: number;
    warningCount: number;
    syntaxErrorCount: number;
  } | null;
}

export interface ProjectSnapshot extends Project {
  capturedAt: string;
  origin: 'ANALYSIS_REQUEST' | 'MIGRATION_BACKFILL';
}

export type ReportJson = string | number | boolean | null | ReportJson[] | { [key: string]: ReportJson };

export interface AnalysisExport {
  schemaVersion: 1;
  project: ProjectSnapshot;
  analysis: {
    id: string;
    projectId: string;
    status: 'SUCCEEDED';
    createdAt: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    profileVersion: string;
    error: null;
  };
  report: { [key: string]: ReportJson };
}

export interface AnalysisHistory {
  items: AnalysisSummary[];
  nextCursor: string | null;
}

export interface AnalysisIssue {
  filePath: string;
  severity: 'error' | 'warning';
  ruleId: string | null;
  message: string;
  line: number | null;
  column: number | null;
  kind: 'lint' | 'syntax';
}

/** Public fields consumed by the consultation UI; the report contains additional metadata. */
export interface AnalysisResults {
  schemaVersion: 1;
  profile: { version: string };
  issues: AnalysisIssue[];
  statistics: NonNullable<AnalysisSummary['statistics']> & {
    durationMs: number;
    ignoredEntryCount: number;
    bytesRead: number;
  };
}

export interface AnalysisComparison {
  schemaVersion: 1;
  matchingVersion: 'file-rule-message-v1';
  baseline: AnalysisSummary;
  target: AnalysisSummary;
  counts: { added: number; persistent: number; resolved: number; moved: number };
  deltas: { errorCount: number; warningCount: number; analyzedFileCount: number; affectedFileCount: number };
  coverage: { newlyAnalyzedFiles: string[]; noLongerAnalyzedFiles: string[] };
  added: AnalysisIssue[];
  resolved: AnalysisIssue[];
  persistent: { baseline: AnalysisIssue; target: AnalysisIssue; positionChanged: boolean }[];
}

export interface Dashboard {
  projectCount: number;
  analysisCount: number;
  completedCount: number;
  succeededCount: number;
  failedCount: number;
  queuedCount: number;
  runningCount: number;
  errorCount: number;
  warningCount: number;
  latestAnalyses: (AnalysisSummary & { projectName: string })[];
}
