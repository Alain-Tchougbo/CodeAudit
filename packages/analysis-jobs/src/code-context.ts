import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { AnalysisIssue, CodeContext } from '@codeaudit/contracts';

export const CONTEXT_LIMITS = Object.freeze({ issues: 100, readBytes: 2 * 1024 * 1024, fileBytes: 128 * 1024, storedBytes: 128 * 1024, lineCharacters: 500, radius: 3 });

/** Bounded, optional snippets. Imported code is read as text and never executed. */
export async function captureCodeContext(root: string, issues: readonly AnalysisIssue[], options: { signal?: AbortSignal; deadlineAt?: number } = {}): Promise<CodeContext> {
  const context: CodeContext = { schemaVersion: 1, truncated: issues.length > CONTEXT_LIMITS.issues, snippets: [] };
  const groups = new Map<string, number[]>();
  for (const issue of issues.slice(0, CONTEXT_LIMITS.issues)) {
    if (issue.line === null || issue.line < 1 || !Number.isSafeInteger(issue.line)) continue;
    const lines = groups.get(issue.filePath); if (lines) lines.push(issue.line); else groups.set(issue.filePath, [issue.line]);
  }
  const canonicalRoot = await realpath(root); let readBytes = 0; let storedBytes = 0;
  for (const [filePath, positions] of groups) {
    if (options.signal?.aborted || Date.now() >= (options.deadlineAt ?? Infinity) || readBytes >= CONTEXT_LIMITS.readBytes) { context.truncated = true; break; }
    try {
      if (!filePath || filePath.includes('\\') || /^[a-z]:/i.test(filePath) || filePath.split('/').includes('..') || isAbsolute(filePath)) throw new Error('Unsafe path');
      const path = resolve(canonicalRoot, filePath); const child = relative(canonicalRoot, path);
      if (!child || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('Unsafe path');
      let parent = canonicalRoot;
      for (const part of child.split(sep)) { parent = resolve(parent, part); if ((await lstat(parent)).isSymbolicLink()) throw new Error('Symlink'); }
      if (await realpath(path) !== path) throw new Error('Noncanonical path');
      const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let text: string; let partial = false;
      try {
        const stat = await handle.stat(); if (!stat.isFile()) throw new Error('Not a file');
        const bytes = Math.min(stat.size, CONTEXT_LIMITS.fileBytes, CONTEXT_LIMITS.readBytes - readBytes);
        const buffer = Buffer.alloc(bytes); const result = await handle.read(buffer, 0, bytes, 0); readBytes += result.bytesRead;
        partial = result.bytesRead < stat.size;
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, result.bytesRead), { stream: partial });
        if (partial) { const end = Math.max(...['\n', '\r', '\u2028', '\u2029'].map(separator => text.lastIndexOf(separator))); text = end < 0 ? '' : text.slice(0, end); }
        if (await realpath(path) !== path) throw new Error('Path changed');
      } finally { await handle.close(); }
      const source = text.split(/\r\n|[\n\r\u2028\u2029]/); const wanted = new Set<number>();
      for (const position of positions) {
        if (position > source.length || (partial && position === source.length && !text)) { context.truncated = true; continue; }
        for (let line = Math.max(1, position - CONTEXT_LIMITS.radius); line <= Math.min(source.length, position + CONTEXT_LIMITS.radius); line++) wanted.add(line);
      }
      const lines: CodeContext['snippets'][number]['lines'] = [];
      for (const number of [...wanted].sort((a, b) => a - b)) {
        const original = source[number - 1]!; const value = original.slice(0, CONTEXT_LIMITS.lineCharacters);
        const bytes = Buffer.byteLength(JSON.stringify({ number, text: value, truncated: value.length !== original.length }));
        if (storedBytes + bytes + Buffer.byteLength(filePath) > CONTEXT_LIMITS.storedBytes) { context.truncated = true; break; }
        storedBytes += bytes; lines.push({ number, text: value, truncated: value.length !== original.length });
        if (value.length !== original.length) context.truncated = true;
      }
      if (lines.length) { storedBytes += Buffer.byteLength(filePath); context.snippets.push({ filePath, lines }); }
      if (partial && positions.some(line => line > source.length)) context.truncated = true;
    } catch { context.truncated = true; }
  }
  while (Buffer.byteLength(JSON.stringify(context)) > CONTEXT_LIMITS.storedBytes && context.snippets.length) {
    context.truncated = true;
    const last = context.snippets[context.snippets.length - 1]!; last.lines.pop();
    if (!last.lines.length) context.snippets.pop();
  }
  return context;
}
