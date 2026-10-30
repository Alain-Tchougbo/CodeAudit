import { ANALYSIS_ARCHIVE_MAX_BYTES } from '@codeaudit/contracts';

export const IMPORT_LIMITS = Object.freeze({
  archiveBytes: ANALYSIS_ARCHIVE_MAX_BYTES,
  entries: 2000,
  fileBytes: 5 * 1024 * 1024,
  expandedBytes: 50 * 1024 * 1024,
  extractionMs: 60_000,
});
export const EXECUTION_LIMITS = Object.freeze({
  analysisMs: 60_000,
  leaseMs: 15_000,
  reportBytes: 10 * 1024 * 1024,
  orphanAgeMs: 24 * 60 * 60 * 1000,
});

export class JobError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JobError';
  }
}
