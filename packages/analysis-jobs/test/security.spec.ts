import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rm, symlink, utimes } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, SourceStore, prepareSources } from '../src';
import { extractZip } from '../src/zip';
import { runThread } from '../src/thread';
import { zip } from './zip-builder';

const roots: string[] = [];
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'codeaudit-jobs-'));
  roots.push(root);
  return SourceStore.open(root);
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-jobs-')) throw new Error('Unsafe cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

describe('Archives ZIP', () => {
  it('extrait de vraies sources JS/TS sans exécuter les configurations ni les scripts', async () => {
    const storage = await store();
    const prepared = await prepareSources(storage, zip([
      { name: 'src/index.ts', data: 'export const value: number = 1;' },
      { name: 'eslint.config.mjs', data: "throw new Error('MUST NOT EXECUTE');" },
      { name: 'package.json', data: '{"scripts":{"prepare":"exit 1"}}' },
    ]));
    expect(prepared.supportedFiles).toBe(2);
    expect(prepared.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(await readFile(join(await storage.sources(prepared.key), 'src/index.ts'), 'utf8')).toContain('value: number');
    await storage.remove(prepared.key);
    expect(await readdir(storage.root)).toEqual([]);
  });

  it.each(['../escape.js', '/escape.js', 'C:/escape.js', 'dir/../../escape.js', 'dir\\escape.js', 'dir/./escape.js',
    'NUL.js', 'con/file.js', 'COM¹.js', 'LPT²/file.js', 'CONIN$', 'CONOUT$.js', 'CLOCK$', 'file.js ', 'file.js.', 'dir//file.js'])('refuse le chemin %s et nettoie le stockage', async (name) => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name, data: 'debugger;' }]))).rejects.toMatchObject({ code: expect.stringMatching(/^ZIP_(PATH_INVALID|CORRUPT)$/) });
    expect(await readdir(storage.root)).toEqual([]);
  });

  it('refuse les liens Unix même vers un chemin interne', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'link.js', data: 'target.js', mode: 0o120777 }])))
      .rejects.toMatchObject({ code: 'ZIP_LINK_FORBIDDEN' });
    expect(await readdir(storage.root)).toEqual([]);
  });

  it('refuse les fichiers spéciaux', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'device.js', mode: 0o20600 }])))
      .rejects.toMatchObject({ code: 'ZIP_FILE_TYPE' });
  });

  it.each([
    { entries: [{ name: 'index.js', data: 'export {};' }, { name: 'INDEX.js', data: 'debugger;' }] },
    { entries: [{ name: 'café.js', data: 'export {};' }, { name: 'cafe\u0301.js', data: 'debugger;' }] },
    { entries: [{ name: 'index.js', data: 'export {};' }, { name: 'index.js', data: 'debugger;' }] },
  ])('refuse les chemins dupliqués après normalisation', async ({ entries }) => {
    const storage = await store();
    await expect(prepareSources(storage, zip(entries))).rejects.toMatchObject({ code: 'ZIP_DUPLICATE_PATH' });
  });

  it('refuse le chiffrement', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'index.js', encrypted: true, data: 'export {};' }])))
      .rejects.toMatchObject({ code: 'ZIP_ENCRYPTED' });
  });

  it('détecte un contenu corrompu par CRC', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'index.js', data: 'export {};', badCrc: true }])))
      .rejects.toMatchObject({ code: 'ZIP_CORRUPT' });
  });

  it('refuse une archive sans source prise en charge', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'README.txt', data: 'No sources' }])))
      .rejects.toMatchObject({ code: 'NO_SUPPORTED_FILES' });
  });

  it('refuse une archive tronquée', async () => {
    const storage = await store();
    await expect(prepareSources(storage, Buffer.from('invalid ZIP'))).rejects.toMatchObject({ code: 'ZIP_CORRUPT' });
  });

  it('borne la taille compressée', async () => {
    const storage = await store();
    await expect(prepareSources(storage, Buffer.alloc(IMPORT_LIMITS.archiveBytes + 1)))
      .rejects.toMatchObject({ code: 'ZIP_TOO_LARGE' });
  });

  it('borne le nombre réel d’entrées', async () => {
    const storage = await store();
    const directory = await storage.create(randomUUID());
    await expect(extractZip(zip([{ name: 'a.js' }, { name: 'b.js' }]), directory, { ...IMPORT_LIMITS, entries: 1 }))
      .rejects.toMatchObject({ code: 'ZIP_ENTRY_LIMIT' });
  });

  it('compte aussi les dossiers implicites dans la limite des entrees', async () => {
    const storage = await store();
    const directory = await storage.create(randomUUID());
    await expect(extractZip(zip([{ name: 'a/b/c.js', data: 'export {};' }]), directory, { ...IMPORT_LIMITS, entries: 2 }))
      .rejects.toMatchObject({ code: 'ZIP_ENTRY_LIMIT' });
  });

  it('refuse les alias de casse des dossiers parents', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'src/a.js' }, { name: 'SRC/b.js' }])))
      .rejects.toMatchObject({ code: 'ZIP_DUPLICATE_PATH' });
  });

  it('borne la taille décompressée par fichier', async () => {
    const storage = await store();
    const directory = await storage.create(randomUUID());
    await expect(extractZip(zip([{ name: 'a.js', data: 'x'.repeat(1000) }]), directory, { ...IMPORT_LIMITS, fileBytes: 100 }))
      .rejects.toMatchObject({ code: 'ZIP_FILE_TOO_LARGE' });
  });

  it('borne le total décompressé de plusieurs fichiers', async () => {
    const storage = await store();
    const directory = await storage.create(randomUUID());
    await expect(extractZip(zip([{ name: 'a.js', data: 'x'.repeat(100) }, { name: 'b.js', data: 'x'.repeat(100) }]), directory,
      { ...IMPORT_LIMITS, expandedBytes: 150 })).rejects.toMatchObject({ code: 'ZIP_EXPANDED_LIMIT' });
  });

  it('rejette une bombe dont la taille décompressée déclarée est mensongère', async () => {
    const storage = await store();
    await expect(prepareSources(storage, zip([{ name: 'a.js', data: 'x'.repeat(1024 * 1024), claimedSize: 1 }])))
      .rejects.toMatchObject({ code: 'ZIP_CORRUPT' });
    expect(await readdir(storage.root)).toEqual([]);
  });
});

describe('Arrêt effectif des calculs', () => {
  it('interrompt un thread bloqué au-delà du délai', async () => {
    await expect(runThread(resolve('test/fixtures/hang.mjs'), {}, { timeoutMs: 100, timeoutCode: 'ANALYSIS_TIMEOUT' }))
      .rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
  });

  it('signale un crash sans résultat', async () => {
    await expect(runThread(resolve('test/fixtures/crash.mjs'), {}, { timeoutMs: 1000, timeoutCode: 'ANALYSIS_TIMEOUT' }))
      .rejects.toMatchObject({ code: 'ENGINE_CRASHED' });
  });

  it('interrompt un thread lors de l’arrêt du worker', async () => {
    const stop = new AbortController();
    const result = runThread(resolve('test/fixtures/hang.mjs'), {}, { timeoutMs: 10000, timeoutCode: 'ANALYSIS_TIMEOUT', signal: stop.signal });
    stop.abort();
    await expect(result).rejects.toMatchObject({ code: 'WORKER_INTERRUPTED' });
  });
});

describe('Nettoyage contrôlé', () => {
  it('refuse un identifiant de chemin arbitraire', async () => {
    const storage = await store();
    await expect(storage.remove('../outside')).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
  });

  it('ne supprime pas la cible d’un lien de stockage', async () => {
    const storage = await store();
    const outside = await store();
    const key = randomUUID();
    await symlink(outside.root, storage.jobPath(key), 'junction');
    await expect(storage.remove(key)).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    expect((await lstat(outside.root)).isDirectory()).toBe(true);
  });

  it('préserve les sources référencées et nettoie les orphelins anciens', async () => {
    const storage = await store();
    const referenced = randomUUID();
    const orphan = randomUUID();
    await storage.create(referenced);
    await storage.create(orphan);
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(storage.jobPath(referenced), old, old);
    await utimes(storage.jobPath(orphan), old, old);
    expect(await storage.reapOrphans(async (key) => key === referenced)).toBe(1);
    expect(await readdir(storage.root)).toEqual([referenced]);
  });
});
