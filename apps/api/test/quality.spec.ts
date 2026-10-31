import { evaluateQualityGate, isQualityPolicy, type QualityPolicy } from '@codeaudit/contracts';
const policy: QualityPolicy = { schemaVersion: 1, enabled: true, maxErrors: 0, maxWarnings: 1 };
describe('Seuils qualité versionnés', () => {
  it('valide les bornes, le schéma et les propriétés exactes', () => {
    expect(isQualityPolicy(policy)).toBe(true);
    for (const invalid of [{ ...policy, maxErrors: -1 }, { ...policy, maxWarnings: 1.5 }, { ...policy, maxErrors: '0' }, { ...policy, schemaVersion: 2 }, { ...policy, unexpected: true }, null]) expect(isQualityPolicy(invalid)).toBe(false);
  });
  it('respecte le seuil inclusif sans convertir une décision négative en échec de traitement', () => {
    expect(evaluateQualityGate(policy, 'SUCCEEDED', { errorCount: 0, warningCount: 1 }).status).toBe('PASS');
    const failed = evaluateQualityGate(policy, 'SUCCEEDED', { errorCount: 1, warningCount: 2 }); expect(failed.status).toBe('FAIL'); expect(failed.criteria.every(item => !item.passed)).toBe(true);
  });
  it('ne présente jamais une attente ou une annulation comme un succès qualité', () => {
    for (const state of ['QUEUED', 'RUNNING'] as const) expect(evaluateQualityGate(policy, state, null)).toMatchObject({ status: 'PENDING', observed: null, criteria: [] });
    for (const state of ['FAILED', 'CANCELLED'] as const) expect(evaluateQualityGate(policy, state, null).status).toBe('UNAVAILABLE');
  });
  it('signale une politique absente ou désactivée sans inventer de décision', () => {
    expect(evaluateQualityGate(null, 'SUCCEEDED', { errorCount: 0, warningCount: 0 }).status).toBe('NOT_CONFIGURED');
    expect(evaluateQualityGate({ ...policy, enabled: false }, 'SUCCEEDED', { errorCount: 100, warningCount: 20 }).criteria).toEqual([]);
  });
  it('refuse une validation en présence de compteurs invalides', () => {
    for (const errorCount of [-1, NaN, Infinity, 1.5]) expect(evaluateQualityGate(policy, 'SUCCEEDED', { errorCount, warningCount: 0 }).status).toBe('UNAVAILABLE');
  });
});
