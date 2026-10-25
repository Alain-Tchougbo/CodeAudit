export type Severity = 'error' | 'warning';

export interface Issue {
  filePath: string;
  severity: Severity;
  ruleId: string | null;
  message: string;
  line: number | null;
  column: number | null;
  endLine: number | null;
  endColumn: number | null;
  kind: 'lint' | 'syntax';
}

export interface FileResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  syntaxErrorCount: number;
}

export interface IgnoredEntry {
  filePath: string;
  kind: 'file' | 'directory' | 'symlink' | 'other';
  reason: 'excluded-directory' | 'unsupported-extension' | 'symbolic-link' | 'binary' | 'invalid-encoding' | 'not-regular-file';
}

export interface AnalysisLimits {
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxDurationMs: number;
}

export interface AnalyzeOptions {
  signal?: AbortSignal;
  limits?: Partial<AnalysisLimits>;
}

export type AnalysisErrorCode =
  | 'INVALID_ROOT' | 'INVALID_OPTIONS' | 'FILE_READ_FAILED' | 'LIMIT_EXCEEDED'
  | 'NO_SUPPORTED_FILES' | 'CANCELLED' | 'ESLINT_FAILURE';

export class AnalysisError extends Error {
  constructor(readonly code: AnalysisErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AnalysisError';
  }
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type RuleLevel = 'off' | 'warn' | 'error';
export type RuleConfiguration = RuleLevel | [RuleLevel, ...JsonValue[]];

export interface AnalysisProfile {
  version: string;
  engines: { eslint: string; typescript: string; typescriptEslint: string };
  ecmaVersion: 2024;
  sourceTypes: { module: string[]; commonjs: string[] };
  supportedExtensions: string[];
  ignoredDirectories: string[];
  globals: Record<string, 'readonly'>;
  rules: { javascript: Record<string, RuleConfiguration>; typescript: Record<string, RuleConfiguration> };
  allowInlineConfig: false;
  fix: false;
  typeInformation: false;
}

export interface AnalysisStatistics {
  discoveredFileCount: number;
  supportedFileCount: number;
  analyzedFileCount: number;
  affectedFileCount: number;
  ignoredEntryCount: number;
  ignoredFileCount: number;
  ignoredDirectoryCount: number;
  errorCount: number;
  warningCount: number;
  issueCount: number;
  syntaxErrorCount: number;
  bytesRead: number;
  durationMs: number;
}

export interface AnalysisReport {
  schemaVersion: 1;
  profile: AnalysisProfile;
  limits: AnalysisLimits;
  startedAt: string;
  completedAt: string;
  issues: Issue[];
  files: FileResult[];
  ignoredEntries: IgnoredEntry[];
  statistics: AnalysisStatistics;
}
