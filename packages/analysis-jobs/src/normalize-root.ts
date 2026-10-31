import { lstat, readdir, realpath, rename, rmdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { SourceStore } from './storage';
import { JobError } from './limits';

/** Only for provider archives, after the normal ZIP validation has completed. */
export async function normalizeArchiveRoot(store: SourceStore, key: string): Promise<void> {
  const directory = await store.sources(key); const job = store.jobPath(key);
  const entries = await readdir(directory, { withFileTypes: true }); const entry = entries[0];
  if (entries.length !== 1 || !entry?.isDirectory() || entry.isSymbolicLink()) throw new JobError('ZIP_ROOT_INVALID', 'L’archive Git doit contenir un unique dossier racine.');
  const wrapper = resolve(directory, entry.name); const temporary = resolve(job, 'normalized-sources');
  const inside = (path: string) => { const child = relative(job, path); return child && !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`); };
  // Verify absolute source and destination before moving a directory. Both are
  // confined to the freshly allocated job; imported names cannot choose a path.
  if (!inside(wrapper) || !inside(temporary) || relative(job, directory) !== 'sources' || await realpath(job) !== job || await realpath(wrapper) !== wrapper) throw new JobError('STORAGE_ERROR', 'Normalisation de stockage non sûre refusée.');
  try { await lstat(temporary); throw new JobError('STORAGE_ERROR', 'Destination de normalisation déjà présente.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  try { await rename(wrapper, temporary); await rmdir(directory); await rename(temporary, directory); }
  catch { throw new JobError('STORAGE_ERROR', 'Impossible de normaliser le dossier Git.'); }
}
