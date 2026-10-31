import type { AnalysisStatus, QualityGate, QualityPolicy } from './index.js';
export function isQualityPolicy(value: unknown): value is QualityPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  const keys = ['schemaVersion', 'enabled', 'maxErrors', 'maxWarnings'];
  return Object.keys(policy).length === keys.length && keys.every(key => Object.hasOwn(policy, key)) && policy.schemaVersion === 1 && typeof policy.enabled === 'boolean'
    && [policy.maxErrors, policy.maxWarnings].every(limit => typeof limit === 'number' && Number.isSafeInteger(limit) && limit >= 0 && limit <= 1_000_000);
}
export function evaluateQualityGate(policy: QualityPolicy | null, state: AnalysisStatus, observed: QualityGate['observed']): Omit<QualityGate, 'analysisId'> {
  const result: Omit<QualityGate, 'analysisId'> = { schemaVersion: 1, status: 'NOT_CONFIGURED', policy, observed, criteria: [] };
  if (!policy?.enabled) return result;
  if (state === 'QUEUED' || state === 'RUNNING') return { ...result, status: 'PENDING', observed: null };
  if (state !== 'SUCCEEDED' || !observed || !Object.values(observed).every(value => Number.isSafeInteger(value) && value >= 0)) return { ...result, status: 'UNAVAILABLE', observed: null };
  const criteria: QualityGate['criteria'] = [
    { metric: 'errorCount', value: observed.errorCount, maximum: policy.maxErrors, passed: observed.errorCount <= policy.maxErrors },
    { metric: 'warningCount', value: observed.warningCount, maximum: policy.maxWarnings, passed: observed.warningCount <= policy.maxWarnings },
  ];
  return { ...result, status: criteria.every(item => item.passed) ? 'PASS' : 'FAIL', criteria };
}
