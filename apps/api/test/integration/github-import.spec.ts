import 'reflect-metadata';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { BadGatewayException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@codeaudit/database';
import type { GitSource } from '@codeaudit/contracts';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { GitHubArchiveService } from '../../src/analyses/github-archive.service';
import { validateReportExport } from '../../src/analyses/report-export.service';
import { signedIn, clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
const source: GitSource = { schemaVersion: 1, provider: 'GITHUB', repository: 'example/source', archiveRepository: 'example/source', requestedRef: 'main', commitSha: 'a'.repeat(40), pullRequest: null };
const fixture = () => ({ source, archive: zip([{ name: 'source-commit/src/index.ts', data: "console.log('hello');" }, { name: 'source-commit/package.json', data: '{"scripts":{"prepare":"MUST_NOT_EXECUTE"}}' }]) });
describe('Import Git — PostgreSQL, ZIP et moteur réels ; fournisseur contrôlé', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>; let projectId: string; let root: string;
  const download = jest.fn<ReturnType<GitHubArchiveService['download']>, Parameters<GitHubArchiveService['download']>>();
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-github-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(GitHubArchiveService).useValue({ download }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app);
  });
  beforeEach(async () => { download.mockReset(); download.mockResolvedValue(fixture()); projectId = (await owner.api.post('/api/projects').send({ name: 'Git import' }).expect(201)).body.id as string; });
  afterEach(async () => { await client.project.deleteMany({ where: { id: projectId } }); });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close();
    if (root) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-github-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  const path = () => `/api/projects/${projectId}/analyses/github`;
  it('contrôle propriétaire, CSRF et données avant tout téléchargement', async () => {
    await other.api.post(path()).send({ repository: 'example/source' }).expect(404);
    await owner.api.post(path()).set('X-CSRF-Token', '').send({ repository: 'example/source' }).expect(403);
    for (const input of [{ repository: 'https://127.0.0.1/internal' }, { repository: 'example/source', ref: null }, { repository: 'example/source', pullRequest: null }, { repository: 'example/source', ref: 'main', pullRequest: 12 }, { repository: 'example/source', token: 'never-accepted' }]) await owner.api.post(path()).send(input).expect(400);
    expect(download).not.toHaveBeenCalled(); expect(await client.analysis.count({ where: { projectId } })).toBe(0);
  });
  it('analyse les sources normalisées et exporte exactement la provenance et le rapport enregistrés', async () => {
    const result = await owner.api.post(path()).send({ repository: 'example/source', ref: 'main', captureContext: true }).expect(202); const id = result.body.id as string; expect(result.body.source).toEqual(source);
    await processNext(new AnalysisQueue(client), await SourceStore.open(), 'github-worker');
    const stored = await client.analysis.findUniqueOrThrow({ where: { id } }); expect(stored.status).toBe('SUCCEEDED'); expect(stored.sourcesDeletedAt).not.toBeNull();
    const results = (await owner.api.get(`/api/analyses/${id}/results`).expect(200)).body; expect(results.issues[0].filePath).toBe('src/index.ts');
    const report = (await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body; expect(report.schemaVersion).toBe(2); expect(validateReportExport(report)).toBe(true); expect(report.source).toEqual(stored.sourceMetadata); expect(report.report).toEqual(stored.report);
    expect((await owner.api.get(`/api/analyses/${id}/context`).expect(200)).body.context.snippets[0].filePath).toBe('src/index.ts');
    await other.api.get(`/api/analyses/${id}`).expect(404); await other.api.get(`/api/analyses/${id}/report`).expect(404);
    await owner.api.patch(`/api/projects/${projectId}`).send({ name: 'Renamed after Git import' }).expect(200); expect((await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body).toEqual(report);
    expect(validateReportExport({ ...report, source: { ...report.source, commitSha: 'invalid' } })).toBe(false);
    expect(validateReportExport({ ...report, schemaVersion: 1 })).toBe(false);
  });
  it('conserve le SHA et le fork d’une tête de pull request', async () => {
    const provenance: GitSource = { ...source, archiveRepository: 'contributor/fork', requestedRef: 'pull/23', commitSha: 'b'.repeat(40), pullRequest: 23 };
    download.mockResolvedValueOnce({ ...fixture(), source: provenance });
    const result = await owner.api.post(path()).send({ repository: 'example/source', pullRequest: 23 }).expect(202);
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ repository: 'example/source', pullRequest: 23 })); expect(result.body.source).toEqual(provenance);
    expect((await client.analysis.findUniqueOrThrow({ where: { id: result.body.id } })).sourceMetadata).toEqual(provenance);
  });
  it('applique les protections ZIP au téléchargement et ne crée aucun travail invalide', async () => {
    const before = await readdir(root);
    for (const entries of [[{ name: 'root/../../escape.js', data: 'debugger;' }], [{ name: 'root/link.js', data: 'target.js', mode: 0o120777 }], [{ name: 'index.js', data: 'debugger;' }]]) {
      download.mockResolvedValueOnce({ source, archive: zip(entries) }); await owner.api.post(path()).send({ repository: 'example/source' }).expect(400);
    }
    expect(await client.analysis.count({ where: { projectId } })).toBe(0); expect(await readdir(root)).toEqual(before);
  });
  it('ne crée pas d’analyse après un échec fournisseur', async () => {
    download.mockRejectedValueOnce(new BadGatewayException({ code: 'GITHUB_UNAVAILABLE', message: 'Fournisseur indisponible.' })); await owner.api.post(path()).send({ repository: 'example/source' }).expect(502);
    expect(await client.analysis.count({ where: { projectId } })).toBe(0);
  });
  it('révérifie la propriété après un téléchargement en cours', async () => {
    download.mockImplementationOnce(async () => { await client.project.update({ where: { id: projectId }, data: { ownerId: other.userId } }); return fixture(); });
    await owner.api.post(path()).send({ repository: 'example/source' }).expect(404); expect(await client.analysis.count({ where: { projectId } })).toBe(0);
  });
  it('borne les téléchargements simultanés et libère le quota après préparation', async () => {
    const complete: (() => void)[] = []; download.mockImplementation(() => new Promise(resolveDownload => { complete.push(() => resolveDownload(fixture())); }));
    const first = owner.api.post(path()).send({ repository: 'example/source' }).then(response => response); const second = owner.api.post(path()).send({ repository: 'example/source' }).then(response => response);
    try {
      for (let attempt = 0; complete.length < 2 && attempt < 300; attempt++) await delay(10);
      expect(complete).toHaveLength(2); await owner.api.post(path()).send({ repository: 'example/source' }).expect(429);
    } finally { complete.forEach(resolveDownload => resolveDownload()); await Promise.all([first, second]); }
    expect(await client.analysis.count({ where: { projectId } })).toBe(2);
  });
});
