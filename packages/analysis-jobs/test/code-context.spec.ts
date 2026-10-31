import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnalysisIssue } from '@codeaudit/contracts';
import { captureCodeContext, CONTEXT_LIMITS } from '../src/code-context';
const roots: string[] = [];
const issue: AnalysisIssue = { filePath: 'src/index.js', line: 5, column: 1, ruleId: 'no-undef', severity: 'error', kind: 'lint', message: 'Unknown.' };
async function fixture(text: string) { const root = await mkdtemp(join(tmpdir(), 'codeaudit-context-')); roots.push(root); await mkdir(join(root, 'src')); await writeFile(join(root, issue.filePath), text); return root; }
afterEach(async () => { for (const root of roots.splice(0)) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-context-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); } });
describe('Extraits de code bornés', () => {
  it('ne conserve que le voisinage des diagnostics et fusionne les lignes communes', async () => {
    const root = await fixture(Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n'));
    const result = await captureCodeContext(root, [issue, { ...issue, line: 6 }]);
    expect(result.snippets[0]?.lines.map(line => line.number)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.snippets[0]?.lines[0]?.text).toBe('line 2'); expect(JSON.stringify(result)).not.toContain('line 20');
  });
  it('borne les longues lignes et la taille sérialisée, y compris en Unicode', async () => {
    const root = await fixture(Array.from({ length: 200 }, () => 'é'.repeat(1000)).join('\n'));
    const result = await captureCodeContext(root, Array.from({ length: 100 }, (_, index) => ({ ...issue, line: index + 1 })));
    expect(result.truncated).toBe(true); expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(CONTEXT_LIMITS.storedBytes);
    expect(result.snippets.every(file => file.lines.every(line => line.text.length <= 500))).toBe(true);
  });
  it.each(['\r\n', '\r', '\u2028', '\u2029'])('respecte les séparateurs de lignes %j', async (separator) => {
    const root = await fixture(['one', 'two', 'three', 'four', 'five', 'six'].join(separator));
    const result = await captureCodeContext(root, [issue]);
    expect(result.snippets[0]?.lines.find(line => line.number === 5)?.text).toBe('five');
  });
  it.each(['../secret.js', '/etc/passwd', 'C:/secret.js', 'src/../../secret.js', 'src\\index.js'])('refuse un chemin non sûr : %s', async (filePath) => {
    const root = await fixture('private'); const result = await captureCodeContext(root, [{ ...issue, line: 1, filePath }]);
    expect(result.snippets).toEqual([]); expect(result.truncated).toBe(true);
  });
  it('signale les fichiers absents et positions hors limite sans inventer de code', async () => {
    const root = await fixture('const value = 1;');
    expect((await captureCodeContext(root, [{ ...issue, line: 900 }])).snippets).toEqual([]);
    expect((await captureCodeContext(root, [{ ...issue, filePath: 'missing.js' }])).truncated).toBe(true);
    expect((await captureCodeContext(root, [{ ...issue, line: null }])).snippets).toEqual([]);
  });
  it('respecte une annulation ou un délai déjà dépassé', async () => {
    const root = await fixture('hello');
    expect((await captureCodeContext(root, [issue], { signal: AbortSignal.abort() })).snippets).toEqual([]);
    expect((await captureCodeContext(root, [issue], { deadlineAt: 1 })).truncated).toBe(true);
  });
});
