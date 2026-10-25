import type { Linter } from 'eslint';
import type { FileResult, Issue } from './types';

function position(value: number | undefined): number | null {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : null;
}

export function normalizeMessages(filePath: string, messages: readonly Linter.LintMessage[]): Issue[] {
  return messages.filter((message) => message.severity > 0).map((message) => ({
    filePath,
    severity: message.severity === 2 ? 'error' : 'warning',
    ruleId: message.ruleId ?? null,
    message: message.message,
    line: position(message.line),
    column: position(message.column),
    endLine: position(message.endLine),
    endColumn: position(message.endColumn),
    kind: message.fatal ? 'syntax' : 'lint',
  }));
}

export function summarizeFile(filePath: string, issues: readonly Issue[]): FileResult {
  return {
    filePath,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    syntaxErrorCount: issues.filter((issue) => issue.kind === 'syntax').length,
  };
}
