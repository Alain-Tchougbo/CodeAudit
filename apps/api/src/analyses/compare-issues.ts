import type { AnalysisComparison, AnalysisIssue } from '@codeaudit/contracts';

const textOrder = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const position = (issue: AnalysisIssue) => JSON.stringify([issue.line, issue.column]);
const identity = (issue: AnalysisIssue) => JSON.stringify([issue.filePath, issue.ruleId, issue.kind, issue.severity, issue.message]);
function order(a: AnalysisIssue, b: AnalysisIssue) {
  return textOrder(a.filePath, b.filePath) || (a.line ?? Infinity) - (b.line ?? Infinity)
    || (a.column ?? Infinity) - (b.column ?? Infinity) || textOrder(identity(a), identity(b));
}
// Project the validated report fields without exposing or mutating its internal objects.
const present = (issue: AnalysisIssue): AnalysisIssue => ({ filePath: issue.filePath, ruleId: issue.ruleId, kind: issue.kind,
  severity: issue.severity, message: issue.message, line: issue.line, column: issue.column });

/** Multiset matching: exact positions first, then ordered occurrences within the same identity. */
export function compareIssues(baseline: readonly AnalysisIssue[], target: readonly AnalysisIssue[]) {
  const groups = new Map<string, { baseline: AnalysisIssue[]; target: AnalysisIssue[] }>();
  for (const [side, issues] of [['baseline', baseline], ['target', target]] as const) {
    for (const issue of issues) {
      const key = identity(issue);
      let group = groups.get(key);
      if (!group) { group = { baseline: [], target: [] }; groups.set(key, group); }
      group[side].push(issue);
    }
  }
  const added: AnalysisIssue[] = []; const resolved: AnalysisIssue[] = [];
  const persistent: AnalysisComparison['persistent'] = [];
  function match(before: AnalysisIssue, after: AnalysisIssue) {
    persistent.push({ baseline: present(before), target: present(after), positionChanged: position(before) !== position(after) });
  }
  for (const group of groups.values()) {
    group.baseline.sort(order); group.target.sort(order);
    const positions = new Map<string, { indexes: number[]; offset: number }>();
    group.baseline.forEach((issue, index) => {
      const key = position(issue); const entry = positions.get(key);
      if (entry) entry.indexes.push(index); else positions.set(key, { indexes: [index], offset: 0 });
    });
    const used = new Set<number>(); const unmatchedTarget: AnalysisIssue[] = [];
    for (const issue of group.target) {
      const entry = positions.get(position(issue)); const index = entry?.indexes[entry.offset];
      if (index !== undefined) { entry!.offset++; used.add(index); match(group.baseline[index]!, issue); }
      else unmatchedTarget.push(issue);
    }
    const unmatchedBaseline = group.baseline.filter((_issue, index) => !used.has(index));
    const paired = Math.min(unmatchedBaseline.length, unmatchedTarget.length);
    for (let index = 0; index < paired; index++) match(unmatchedBaseline[index]!, unmatchedTarget[index]!);
    for (let index = paired; index < unmatchedBaseline.length; index++) resolved.push(present(unmatchedBaseline[index]!));
    for (let index = paired; index < unmatchedTarget.length; index++) added.push(present(unmatchedTarget[index]!));
  }
  added.sort(order); resolved.sort(order); persistent.sort((a, b) => order(a.target, b.target));
  return { added, resolved, persistent, counts: { added: added.length, resolved: resolved.length, persistent: persistent.length,
    moved: persistent.filter(item => item.positionChanged).length } };
}
