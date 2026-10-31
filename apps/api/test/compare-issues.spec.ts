import type { AnalysisIssue } from '@codeaudit/contracts';
import { compareIssues } from '../src/analyses/compare-issues';

const issue: AnalysisIssue = { filePath: 'src/index.js', ruleId: 'no-undef', kind: 'lint', severity: 'error', message: 'missing is not defined.', line: 1, column: 1 };
describe('Rapprochement des diagnostics', () => {
  it('sépare nouveaux, persistants et résolus, sans modifier les rapports', () => {
    const baseline = Object.freeze([Object.freeze(issue), Object.freeze({ ...issue, filePath: 'removed.js' })]);
    const target = Object.freeze([Object.freeze({ ...issue, filePath: 'new.js' }), Object.freeze(issue)]);
    const result = compareIssues(baseline, target);
    expect(result.counts).toEqual({ added: 1, persistent: 1, resolved: 1, moved: 0 });
    expect(result.added[0]?.filePath).toBe('new.js'); expect(result.resolved[0]?.filePath).toBe('removed.js');
    expect(baseline[0]).toBe(issue); expect(target[1]).toBe(issue);
  });
  it('tolère les décalages de ligne et colonne tout en conservant les deux positions', () => {
    const result = compareIssues([issue], [{ ...issue, line: 9, column: 3 }]);
    expect(result.counts).toEqual({ added: 0, persistent: 1, resolved: 0, moved: 1 });
    expect(result.persistent[0]).toMatchObject({ baseline: { line: 1, column: 1 }, target: { line: 9, column: 3 }, positionChanged: true });
  });
  it('préserve les positions exactes avant d’apparier les occurrences restantes', () => {
    const result = compareIssues([{ ...issue, line: 10 }, { ...issue, line: 20 }], [{ ...issue, line: 20 }]);
    expect(result.persistent[0]?.baseline.line).toBe(20); expect(result.counts.moved).toBe(0); expect(result.resolved[0]?.line).toBe(10);
  });
  it('conserve la multiplicité même avec des doublons à la même position', () => {
    const result = compareIssues([issue, issue, issue], [issue]);
    expect(result.counts).toEqual({ added: 0, persistent: 1, resolved: 2, moved: 0 });
    expect(compareIssues([issue], [issue, issue]).counts).toEqual({ added: 1, persistent: 1, resolved: 0, moved: 0 });
  });
  it.each([{ severity: 'warning' as const }, { ruleId: 'other' }, { message: 'Changed.' }, { kind: 'syntax' as const }, { filePath: 'renamed.js' }])('distingue les changements d’identité (%j)', (change) => {
    expect(compareIssues([issue], [{ ...issue, ...change }]).counts).toEqual({ added: 1, persistent: 0, resolved: 1, moved: 0 });
  });
  it('gère les diagnostics de syntaxe et les positions absentes', () => {
    const syntax = { ...issue, ruleId: null, kind: 'syntax' as const, line: null, column: null };
    expect(compareIssues([syntax], [syntax]).counts).toEqual({ added: 0, persistent: 1, resolved: 0, moved: 0 });
    expect(compareIssues([syntax], [{ ...syntax, line: 1 }]).counts.moved).toBe(1);
  });
  it('produit un ordre stable indépendant de l’ordre des rapports', () => {
    const before = [issue, { ...issue, line: 5 }, { ...issue, filePath: '__proto__' }];
    const after = [{ ...issue, line: 8 }, issue, { ...issue, filePath: 'added' }];
    expect(compareIssues(before, after)).toEqual(compareIssues([...before].reverse(), [...after].reverse()));
  });
  it('accepte les rapports propres et les groupes volumineux', () => {
    expect(compareIssues([], []).counts).toEqual({ added: 0, persistent: 0, resolved: 0, moved: 0 });
    const duplicates = Array.from({ length: 10000 }, (_, index) => ({ ...issue, line: index + 1 }));
    expect(compareIssues(duplicates, duplicates.slice(5000)).counts).toEqual({ added: 0, persistent: 5000, resolved: 5000, moved: 0 });
  });
});
