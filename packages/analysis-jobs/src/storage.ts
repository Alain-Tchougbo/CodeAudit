import { lstat, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { EXECUTION_LIMITS, JobError } from './limits';

const workspaceRoot = resolve(__dirname, '../../..');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SourceStore {
  private constructor(readonly root: string) {}

  static async open(configured = process.env.CODEAUDIT_STORAGE_ROOT): Promise<SourceStore> {
    const root = resolve(workspaceRoot, configured ?? '.tmp/imports');
    if (root === parse(root).root || root === workspaceRoot) throw new JobError('STORAGE_ERROR', 'Un répertoire temporaire dédié est requis.');
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await lstat(root)).isSymbolicLink()) throw new JobError('STORAGE_ERROR', 'Le stockage temporaire ne peut pas être un lien.');
    return new SourceStore(await realpath(root));
  }

  jobPath(key: string): string {
    if (!uuid.test(key)) throw new JobError('STORAGE_ERROR', 'Identifiant de stockage invalide.');
    const path = resolve(this.root, key);
    const child = relative(this.root, path);
    if (!child || child.startsWith('..') || isAbsolute(child) || child.includes(sep)) throw new JobError('STORAGE_ERROR', 'Chemin de stockage invalide.');
    return path;
  }

  async create(key: string): Promise<string> {
    const path = this.jobPath(key);
    await mkdir(path, { mode: 0o700 });
    const sources = resolve(path, 'sources');
    await mkdir(sources, { mode: 0o700 });
    return sources;
  }

  async sources(key: string): Promise<string> {
    const path = this.jobPath(key);
    const parent = await lstat(path);
    const sources = resolve(path, 'sources');
    const info = await lstat(sources);
    if (!parent.isDirectory() || parent.isSymbolicLink() || !info.isDirectory() || info.isSymbolicLink()
      || await realpath(path) !== path || await realpath(sources) !== sources) {
      throw new JobError('SOURCE_MISSING', 'Les sources de cette analyse sont absentes ou invalides.');
    }
    return sources;
  }

  async remove(key: string): Promise<void> {
    const path = this.jobPath(key);
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) {
        throw new JobError('STORAGE_ERROR', 'Suppression d’un stockage non sûr refusée.');
      }
      // Le chemin absolu a ete verifie sous root ; rm ne suit pas les liens enfants.
      await rm(path, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async reapOrphans(isReferenced: (key: string) => Promise<boolean>, ageMs = EXECUTION_LIMITS.orphanAgeMs): Promise<number> {
    let removed = 0;
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!uuid.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
      const info = await lstat(this.jobPath(entry.name));
      if (Date.now() - info.mtimeMs < ageMs || await isReferenced(entry.name)) continue;
      await this.remove(entry.name);
      removed++;
    }
    return removed;
  }
}
