import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceStore, prepareSources } from '../src';
import { zip } from './zip-builder';
const roots: string[] = [];
async function store() { const root = await mkdtemp(resolve(tmpdir(), 'codeaudit-git-root-')); roots.push(root); return SourceStore.open(root); }
afterEach(async () => { for (const root of roots.splice(0)) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-git-root-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); } });
describe('Normalisation après validation ZIP', () => {
  it('retire uniquement le dossier enveloppe en préservant les octets et le digest importé', async () => {
    const storage = await store(); const source = 'export const answer: number = 42;\r\n';
    const archive = zip([{ name: 'repo-commit/' }, { name: 'repo-commit/src/index.ts', data: source }, { name: 'repo-commit/package.json', data: '{"scripts":{"prepare":"exit 1"}}' }]);
    const normalized = await prepareSources(storage, archive, { stripSingleRoot: true }); const original = await prepareSources(storage, archive);
    expect(normalized.digest).toBe(original.digest); expect(await readFile(resolve(await storage.sources(normalized.key), 'src/index.ts'), 'utf8')).toBe(source);
    expect(await readdir(await storage.sources(normalized.key))).toEqual(expect.arrayContaining(['src', 'package.json']));
    expect(await readFile(resolve(await storage.sources(original.key), 'repo-commit/src/index.ts'), 'utf8')).toBe(source);
  });
  it.each([
    { entries: [{ name: 'one/index.js', data: 'export const a = 1;' }, { name: 'two/index.js', data: 'export const b = 2;' }] },
    { entries: [{ name: 'index.js', data: 'export const a = 1;' }] },
  ])('refuse une archive sans unique dossier enveloppe et nettoie le stockage', async ({ entries }) => {
    const storage = await store(); await expect(prepareSources(storage, zip(entries), { stripSingleRoot: true })).rejects.toMatchObject({ code: 'ZIP_ROOT_INVALID' }); expect(await readdir(storage.root)).toEqual([]);
  });
  it('contrôle les traversées et liens avant tout déplacement', async () => {
    const storage = await store();
    for (const entry of [{ name: 'root/../../escape.js', data: 'debugger;' }, { name: 'root/link.js', data: 'index.js', mode: 0o120777 }]) {
      await expect(prepareSources(storage, zip([entry]), { stripSingleRoot: true })).rejects.toMatchObject({ code: expect.stringMatching(/^ZIP_/) }); expect(await readdir(storage.root)).toEqual([]);
    }
  });
});
