import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { TextDecoder } from 'node:util';
import { createControlledLinter, getAnalysisProfile, IGNORED_DIRECTORIES, SUPPORTED_EXTENSIONS } from './profile';
import { normalizeMessages, summarizeFile } from './normalize';
import { AnalysisError, type AnalysisLimits, type AnalyzeOptions, type AnalysisReport, type FileResult, type IgnoredEntry, type Issue } from './types';

const defaults: AnalysisLimits = {
  maxEntries: 2000, maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024, maxDurationMs: 60_000,
};
export const DEFAULT_ANALYSIS_LIMITS = Object.freeze(defaults);
const lexical = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const portable = (path: string): string => path.split(sep).join('/');

export async function analyzeProject(directory: string, options: AnalyzeOptions = {}): Promise<AnalysisReport> {
  const profile = getAnalysisProfile(options.profileVersion);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const limits = { ...defaults, ...options.limits };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new AnalysisError('INVALID_OPTIONS', 'Les limites doivent être des entiers strictement positifs.');
  }
  // Le buffer borne doit rester representable ; il ne depend pas de la taille annoncee.
  if (limits.maxFileBytes > 50 * 1024 * 1024) throw new AnalysisError('INVALID_OPTIONS', 'La limite par fichier ne peut pas dépasser 50 Mio.');
  function checkpoint(): void {
    if (options.signal?.aborted) throw new AnalysisError('CANCELLED', 'Analyse annulée.');
    if (performance.now() - started > limits.maxDurationMs) throw new AnalysisError('LIMIT_EXCEEDED', 'Durée maximale de l’analyse dépassée.');
  }
  checkpoint();
  let root: string;
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Not a directory');
    root = await realpath(directory);
  } catch (cause) {
    throw new AnalysisError('INVALID_ROOT', 'Le répertoire du projet est absent, inaccessible ou invalide.', { cause });
  }
  const candidates: string[] = [];
  const ignoredEntries: IgnoredEntry[] = [];
  let entries = 0;
  let discoveredFileCount = 0;

  async function ensureInside(path: string): Promise<void> {
    const target = relative(root, await realpath(path));
    if (target === '..' || target.startsWith('..' + sep) || isAbsolute(target)) {
      throw new AnalysisError('FILE_READ_FAILED', 'Une entrée sort du répertoire du projet.');
    }
  }
  async function scan(path: string): Promise<void> {
    checkpoint();
    await ensureInside(path);
    const children = await readdir(path, { withFileTypes: true });
    children.sort((a, b) => lexical(a.name, b.name));
    for (const child of children) {
      checkpoint();
      if (++entries > limits.maxEntries) throw new AnalysisError('LIMIT_EXCEEDED', 'Nombre maximal d’entrées dépassé.');
      const absolute = resolve(path, child.name);
      const filePath = portable(relative(root, absolute));
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        ignoredEntries.push({ filePath, kind: 'symlink', reason: 'symbolic-link' });
      } else if (info.isDirectory()) {
        if (IGNORED_DIRECTORIES.some((name) => name === child.name)) {
          ignoredEntries.push({ filePath, kind: 'directory', reason: 'excluded-directory' });
        } else await scan(absolute);
      } else if (info.isFile()) {
        discoveredFileCount++;
        if (SUPPORTED_EXTENSIONS.some((extension) => extension === extname(child.name).toLowerCase())) candidates.push(absolute);
        else ignoredEntries.push({ filePath, kind: 'file', reason: 'unsupported-extension' });
      } else ignoredEntries.push({ filePath, kind: 'other', reason: 'not-regular-file' });
    }
  }

  const files: FileResult[] = [];
  const issues: Issue[] = [];
  let totalBytes = 0;
  try {
    await scan(root);
    candidates.sort((a, b) => lexical(portable(relative(root, a)), portable(relative(root, b))));
    const linter = createControlledLinter(profile.version);
    for (const absolute of candidates) {
      checkpoint();
      const filePath = portable(relative(root, absolute));
      await ensureInside(absolute);
      const before = await lstat(absolute);
      if (before.isSymbolicLink() || !before.isFile()) throw new AnalysisError('FILE_READ_FAILED', 'Un fichier a changé pendant l’analyse.');
      const handle = await open(absolute, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
      let bytes: Buffer;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev) throw new AnalysisError('FILE_READ_FAILED', 'Un fichier a changé pendant l’analyse.');
        if (info.size > limits.maxFileBytes) throw new AnalysisError('LIMIT_EXCEEDED', 'Taille maximale par fichier dépassée.');
        const buffer = Buffer.alloc(Math.min(limits.maxFileBytes, limits.maxTotalBytes - totalBytes) + 1);
        let offset = 0;
        while (offset < buffer.length) {
          checkpoint();
          const result = await handle.read(buffer, offset, buffer.length - offset, null);
          if (result.bytesRead === 0) break;
          offset += result.bytesRead;
        }
        totalBytes += offset;
        if (offset > limits.maxFileBytes || totalBytes > limits.maxTotalBytes) throw new AnalysisError('LIMIT_EXCEEDED', 'Taille maximale de sources dépassée.');
        bytes = buffer.subarray(0, offset);
      } finally { await handle.close(); }
      if (bytes.includes(0)) {
        ignoredEntries.push({ filePath, kind: 'file', reason: 'binary' });
        continue;
      }
      let source: string;
      try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch {
        ignoredEntries.push({ filePath, kind: 'file', reason: 'invalid-encoding' });
        continue;
      }
      // Aucun chemin du projet n'est transmis aux parsers ou a la resolution de configuration.
      let messages;
      try {
        const results = await linter.lintText(source, {
          filePath: `__codeaudit_input__/source${extname(absolute).toLowerCase()}`,
          warnIgnored: false,
        });
        if (results.length !== 1) throw new Error('Unexpected ESLint result');
        messages = results[0]!.messages;
      } catch (cause) {
        throw new AnalysisError('ESLINT_FAILURE', 'Le moteur ESLint n’a pas pu terminer l’analyse.', { cause });
      }
      checkpoint();
      const normalized = normalizeMessages(filePath, messages);
      issues.push(...normalized);
      files.push(summarizeFile(filePath, normalized));
    }
  } catch (cause) {
    if (cause instanceof AnalysisError) throw cause;
    throw new AnalysisError('FILE_READ_FAILED', 'Impossible de parcourir ou lire les sources du projet.', { cause });
  }
  if (!files.length) throw new AnalysisError('NO_SUPPORTED_FILES', 'Aucun fichier source pris en charge n’a pu être analysé.');
  ignoredEntries.sort((a, b) => lexical(a.filePath, b.filePath));
  const errorCount = files.reduce((sum, file) => sum + file.errorCount, 0);
  const warningCount = files.reduce((sum, file) => sum + file.warningCount, 0);
  return {
    schemaVersion: 1 as const,
    profile,
    limits,
    startedAt,
    completedAt: new Date().toISOString(),
    issues,
    files,
    ignoredEntries,
    statistics: {
      discoveredFileCount,
      supportedFileCount: candidates.length,
      analyzedFileCount: files.length,
      affectedFileCount: files.filter((file) => file.errorCount + file.warningCount > 0).length,
      ignoredEntryCount: ignoredEntries.length,
      ignoredFileCount: ignoredEntries.filter((entry) => entry.kind === 'file').length,
      ignoredDirectoryCount: ignoredEntries.filter((entry) => entry.kind === 'directory').length,
      errorCount,
      warningCount,
      issueCount: errorCount + warningCount,
      syntaxErrorCount: files.reduce((sum, file) => sum + file.syntaxErrorCount, 0),
      bytesRead: totalBytes,
      durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    },
  };
}
