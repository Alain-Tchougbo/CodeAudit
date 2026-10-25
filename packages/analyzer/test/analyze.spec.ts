import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeProject, getAnalysisProfile, normalizeMessages } from '../src';

const fixture = (name: string) => resolve('test/fixtures', name);
const temporaryDirectories: string[] = [];

async function temporary(files: Record<string, string | Uint8Array>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'codeaudit-analyzer-'));
  temporaryDirectories.push(directory);
  for (const [path, source] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), source);
  }
  return directory;
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('codeaudit-analyzer-')) {
      throw new Error('Unsafe temporary cleanup path');
    }
    await rm(directory, { recursive: true, force: true });
  }
});

describe('Fixtures JS/TS réelles', () => {
  it('analyse les huit extensions propres sans aucun diagnostic', async () => {
    const report = await analyzeProject(fixture('clean'));
    expect(report.statistics).toMatchObject({
      analyzedFileCount: 8, affectedFileCount: 0, errorCount: 0, warningCount: 0,
      syntaxErrorCount: 0, issueCount: 0, ignoredEntryCount: 0,
    });
    expect(report.files.map((file) => file.filePath).sort()).toEqual([
      'index.js', 'index.ts', 'module.cjs', 'module.mjs', 'types.cts', 'types.mts', 'view.jsx', 'view.tsx',
    ]);
    expect(report.issues).toEqual([]);
  });

  it('normalise les erreurs JS et TS, leurs règles et leurs positions', async () => {
    const report = await analyzeProject(fixture('errors'));
    expect(report.statistics).toMatchObject({ errorCount: 4, warningCount: 0, affectedFileCount: 2, issueCount: 4 });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ filePath: 'index.js', ruleId: 'no-debugger', severity: 'error', line: 2, column: 3, kind: 'lint' }),
      expect.objectContaining({ filePath: 'index.js', ruleId: 'eqeqeq', line: 3, column: 16 }),
      expect.objectContaining({ filePath: 'index.js', ruleId: 'no-undef', line: 5, column: 1 }),
      expect.objectContaining({ filePath: 'index.ts', ruleId: 'eqeqeq', line: 2, column: 16 }),
    ]));
    expect(report.issues.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('compte séparément les avertissements sans les transformer en erreurs', async () => {
    const report = await analyzeProject(fixture('warnings'));
    expect(report.statistics).toMatchObject({ errorCount: 0, warningCount: 5, issueCount: 5, affectedFileCount: 2 });
    expect(report.issues.map((issue) => issue.ruleId).sort()).toEqual([
      '@typescript-eslint/no-explicit-any', '@typescript-eslint/no-explicit-any', 'no-console', 'no-unused-vars', 'prefer-const',
    ]);
    expect(report.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('traite les syntaxes invalides comme des diagnostics et poursuit les autres fichiers', async () => {
    const report = await analyzeProject(fixture('syntax'));
    expect(report.statistics).toMatchObject({ analyzedFileCount: 2, errorCount: 2, syntaxErrorCount: 2, warningCount: 0 });
    expect(report.issues).toHaveLength(2);
    for (const issue of report.issues) {
      expect(issue).toMatchObject({ ruleId: null, kind: 'syntax', severity: 'error' });
      expect(issue.line).toBeGreaterThan(0);
      expect(issue.column).toBeGreaterThan(0);
    }
  });

  it('ignore les sorties de build et les formats non pris en charge avec un motif explicite', async () => {
    const report = await analyzeProject(fixture('ignored'));
    expect(report.files.map((file) => file.filePath)).toEqual(['src/index.js']);
    expect(report.ignoredEntries).toEqual([
      { filePath: 'build', kind: 'directory', reason: 'excluded-directory' },
      { filePath: 'notes.txt', kind: 'file', reason: 'unsupported-extension' },
    ]);
    expect(report.statistics).toMatchObject({ errorCount: 0, warningCount: 0, ignoredFileCount: 1, ignoredDirectoryCount: 1 });
  });
});

describe('Isolation du profil et des sources', () => {
  it('ne charge ni configuration, plugin, tsconfig, script ni dépendance importés', async () => {
    const directory = await temporary({
      'eslint.config.mjs': "throw new Error('CONFIG MUST NOT RUN');\n",
      '.eslintrc.cjs': "throw new Error('LEGACY CONFIG MUST NOT RUN');\n",
      'package.json': '{"type":"module","scripts":{"prepare":"exit 1"},"eslintConfig":{"extends":"unknown-plugin"}}',
      'tsconfig.json': 'INVALID JSON MUST NOT BE READ',
      '.eslintignore': 'source.js\nsource.ts\n',
      'node_modules/@typescript-eslint/parser/index.js': "throw new Error('IMPORTED PARSER MUST NOT RUN');\n",
      'source.js': '/* eslint-disable */\ndebugger;\n',
      'source.ts': 'export const value: number = 1;\n',
    });
    const marker = join(directory, 'executed.marker');
    await writeFile(join(directory, 'eslint.config.mjs'),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('CONFIG EXECUTED');\n`);
    const report = await analyzeProject(directory);
    expect(report.issues.filter((issue) => issue.ruleId === 'no-debugger')).toHaveLength(1);
    expect(report.files.some((file) => file.filePath === 'source.ts')).toBe(true);
    expect(report.ignoredEntries).toContainEqual({ filePath: 'node_modules', kind: 'directory', reason: 'excluded-directory' });
    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ne permet pas aux commentaires de déclarer des globals ou de désactiver des règles', async () => {
    const directory = await temporary({ 'index.js': '/* global invented */\n/* eslint no-debugger: off */\ninvented();\ndebugger;\n' });
    const report = await analyzeProject(directory);
    expect(report.issues.map((issue) => issue.ruleId)).toEqual(['no-undef', 'no-debugger']);
  });

  it('ne corrige jamais les sources, même avec des règles possédant un fix', async () => {
    const path = join(fixture('warnings'), 'index.js');
    const before = await readFile(path);
    const report = await analyzeProject(fixture('warnings'));
    expect(report.profile.fix).toBe(false);
    expect(await readFile(path)).toEqual(before);
    expect(JSON.stringify(report)).not.toContain('fixes');
  });

  it('ne suit pas un lien vers un répertoire extérieur', async () => {
    const outside = await temporary({ 'secret.js': 'debugger;\n' });
    const directory = await temporary({ 'index.js': 'export const value = 1;\n' });
    await symlink(outside, join(directory, 'outside'), 'junction');
    const report = await analyzeProject(directory);
    expect(report.statistics.analyzedFileCount).toBe(1);
    expect(report.ignoredEntries).toContainEqual({ filePath: 'outside', kind: 'symlink', reason: 'symbolic-link' });
  });

  it('ignore les fichiers binaires et les encodages UTF-8 invalides', async () => {
    const directory = await temporary({
      'index.js': 'export const value = 1;\n',
      'binary.js': new Uint8Array([0, 1, 2]),
      'invalid.ts': new Uint8Array([0xc3, 0x28]),
    });
    const report = await analyzeProject(directory);
    expect(report.ignoredEntries).toEqual([
      { filePath: 'binary.js', kind: 'file', reason: 'binary' },
      { filePath: 'invalid.ts', kind: 'file', reason: 'invalid-encoding' },
    ]);
    expect(report.statistics).toMatchObject({ supportedFileCount: 3, analyzedFileCount: 1, ignoredFileCount: 2 });
  });

  it('retourne un profil versionné et des rapports JSON déterministes hors horodatages', async () => {
    const first = await analyzeProject(fixture('errors'));
    const second = await analyzeProject(fixture('errors'));
    expect(second.issues).toEqual(first.issues);
    expect(second.files).toEqual(first.files);
    expect(second.profile).toEqual(first.profile);
    expect(first.profile.engines.eslint).toMatch(/^10\./);
    expect(first.profile.engines.typescriptEslint).toMatch(/^8\./);
    expect(JSON.parse(JSON.stringify(first)).issues).toEqual(first.issues);
    const profile = getAnalysisProfile();
    profile.rules.javascript['no-debugger'] = 'off';
    expect(getAnalysisProfile().rules.javascript['no-debugger']).toBe('error');
  });
});

describe('Erreurs techniques et limites', () => {
  it('refuse un répertoire absent', async () => {
    await expect(analyzeProject(join(fixture('clean'), 'missing'))).rejects.toMatchObject({ code: 'INVALID_ROOT' });
  });

  it('refuse une racine fichier', async () => {
    await expect(analyzeProject(join(fixture('clean'), 'index.js'))).rejects.toMatchObject({ code: 'INVALID_ROOT' });
  });

  it('signale qu’aucune source prise en charge n’est disponible', async () => {
    const directory = await temporary({ 'notes.txt': 'empty project' });
    await expect(analyzeProject(directory)).rejects.toMatchObject({ code: 'NO_SUPPORTED_FILES' });
  });

  it('respecte une annulation avant toute analyse', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(analyzeProject(fixture('clean'), { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('borne le nombre d’entrées', async () => {
    await expect(analyzeProject(fixture('clean'), { limits: { maxEntries: 1 } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('borne la taille réellement lue par fichier', async () => {
    await expect(analyzeProject(fixture('clean'), { limits: { maxFileBytes: 1 } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it('borne le volume total de sources', async () => {
    await expect(analyzeProject(fixture('clean'), { limits: { maxTotalBytes: 1 } })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
  });

  it.each([0, -1, NaN, Infinity, 1.5])('rejette une limite invalide : %s', async (maxEntries) => {
    await expect(analyzeProject(fixture('clean'), { limits: { maxEntries } })).rejects.toMatchObject({ code: 'INVALID_OPTIONS' });
  });

  it('normalise explicitement l’absence de position', () => {
    const [issue] = normalizeMessages('index.js', [{ ruleId: null, severity: 1, message: 'Sans position', line: 0, column: 0 }]);
    expect(issue).toMatchObject({ line: null, column: null, endLine: null, endColumn: null, ruleId: null });
  });
});
