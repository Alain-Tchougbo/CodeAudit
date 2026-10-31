export interface HealthResponse {
  status: 'ok';
  service: 'codeaudit-api';
}

export interface RuleProfileOption { version: string; name: string; description: string; rules: { javascript: Record<string, unknown>; typescript: Record<string, unknown> } }
export interface ProjectRuleProfile { selectedVersion: string; profiles: RuleProfileOption[] }

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;
export const ANALYSIS_ARCHIVE_MAX_BYTES = 10 * 1024 * 1024;
export interface AuthUser { id: string; name: string; email: string; createdAt: string }
export interface AuthProfile { user: AuthUser; csrfToken: string; expiresAt: string }
export interface ActiveSession { id: string; current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string }

export interface Project {
  team: { id: string; name: string } | null;
  permissions: ProjectPermissions;
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

export type AnalysisStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface AnalysisSummary {
  permissions: ProjectPermissions;
  cancelRequestedAt?: string | null;
  heartbeatAt?: string | null;
  deadlineAt?: string | null;
  id: string;
  projectId: string;
  status: AnalysisStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  profileVersion: string | null;
  source?: GitSource | null;
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

export interface ProjectSnapshot extends Pick<Project, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt'> {
  capturedAt: string;
  origin: 'ANALYSIS_REQUEST' | 'MIGRATION_BACKFILL';
}

export type ReportJson = string | number | boolean | null | ReportJson[] | { [key: string]: ReportJson };

export interface AnalysisExportData {
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
export type AnalysisExport = AnalysisExportData & ({ schemaVersion: 1; source?: never } | { schemaVersion: 2; source: GitSource });

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

export interface CodeContext {
  schemaVersion: 1;
  truncated: boolean;
  snippets: { filePath: string; lines: { number: number; text: string; truncated: boolean }[] }[];
}
export interface AnalysisCodeContext { requested: boolean; context: CodeContext | null }

export interface Dashboard {
  cancelledCount: number;
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

export interface GitSource {
  schemaVersion: 1;
  provider: 'GITHUB';
  repository: string;
  archiveRepository: string;
  requestedRef: string;
  commitSha: string;
  pullRequest: number | null;
}
export interface GitImportRequest { repository: string; ref?: string; pullRequest?: number; captureContext?: boolean }

export interface QualityPolicy { schemaVersion: 1; enabled: boolean; maxErrors: number; maxWarnings: number }
export interface QualityGate {
  analysisId: string;
  schemaVersion: 1;
  status: 'PASS' | 'FAIL' | 'PENDING' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
  policy: QualityPolicy | null;
  observed: { errorCount: number; warningCount: number } | null;
  criteria: { metric: 'errorCount' | 'warningCount'; value: number; maximum: number; passed: boolean }[];
}
export interface ApiKeySummary { id: string; projectId: string; name: string; createdAt: string; expiresAt: string; lastUsedAt: string | null }
export interface ApiKeyCreated { key: ApiKeySummary; token: string }
export { isQualityPolicy, evaluateQualityGate } from './quality.js';

export interface ProjectPermissions { write: boolean; admin: boolean }
export type TeamRole = 'ADMIN' | 'MEMBER' | 'READER';
export interface TeamSummary { id: string; name: string; role: TeamRole; createdAt: string; memberCount: number; projectCount: number }
export interface TeamMember { userId: string; name: string; role: TeamRole; joinedAt: string; email?: string }
export interface TeamDetail extends TeamSummary { members: TeamMember[] }
export interface TeamInvitation { id: string; email: string; role: 'MEMBER' | 'READER'; createdAt: string; expiresAt: string }
export interface InvitationPreview { teamId: string; teamName: string; role: 'MEMBER' | 'READER'; expiresAt: string }
