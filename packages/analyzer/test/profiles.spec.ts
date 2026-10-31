import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { analyzeProject, getAnalysisProfile, ANALYSIS_PROFILE_VERSION, STRICT_PROFILE_VERSION } from '../src';
describe('Profils contrôlés versionnés', () => {
  it('préserve le profil historique par défaut et sépare les copies', () => {
    expect(getAnalysisProfile()).toEqual(getAnalysisProfile(ANALYSIS_PROFILE_VERSION));
    const modified = getAnalysisProfile(); modified.rules.javascript['no-console'] = 'off';
    expect(getAnalysisProfile().rules.javascript['no-console']).toBe('warn');
    expect(getAnalysisProfile(STRICT_PROFILE_VERSION).rules.javascript['no-console']).toBe('error');
  });
  it('refuse les noms de modules et chemins au lieu de les charger', async () => {
    for (const version of ['../eslint.config.js', 'eslint:recommended', '', '__proto__']) {
      await expect(analyzeProject(resolve('test/fixtures/clean'), { profileVersion: version })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
    }
  });
  it('analyse réellement les fixtures avec chaque profil, sans correction', async () => {
    const base = await analyzeProject(resolve('test/fixtures/warnings'));
    const strict = await analyzeProject(resolve('test/fixtures/warnings'), { profileVersion: STRICT_PROFILE_VERSION });
    expect(base.profile.version).toBe(ANALYSIS_PROFILE_VERSION); expect(strict.profile.version).toBe(STRICT_PROFILE_VERSION);
    expect(base.statistics.warningCount).toBeGreaterThan(0); expect(strict.statistics.errorCount).toBeGreaterThan(base.statistics.errorCount);
    expect(strict.profile).toMatchObject({ fix: false, allowInlineConfig: false, typeInformation: false });
    expect(strict.issues.some(issue => issue.ruleId === 'no-console' && issue.severity === 'error')).toBe(true);
    expect((await analyzeProject(resolve('test/fixtures/clean'), { profileVersion: STRICT_PROFILE_VERSION })).statistics.issueCount).toBe(0);
  });
  it('signale la complexité et la profondeur uniquement avec le profil strict', async () => {
    const root = resolve('test/fixtures/strict');
    expect((await analyzeProject(root)).issues).toEqual([]);
    const report = await analyzeProject(root, { profileVersion: STRICT_PROFILE_VERSION });
    expect(report.issues.map(issue => issue.ruleId)).toEqual(expect.arrayContaining(['complexity', 'max-depth']));
    expect(report.issues.every(issue => issue.severity === 'warning')).toBe(true);
  });
});
