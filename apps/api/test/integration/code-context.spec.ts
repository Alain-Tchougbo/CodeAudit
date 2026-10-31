import 'reflect-metadata';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { signedIn, clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
describe('Extraits persistés — PostgreSQL réel', () => {
  let app: INestApplication; let client: PrismaClient; let root: string; let projectId: string;
  let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>;
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-code-context-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app);
  });
  beforeEach(async () => { projectId = (await client.project.create({ data: { ownerId: owner.userId, name: 'Code context' } })).id; });
  afterEach(async () => { const queue = new AnalysisQueue(client); await client.analysis.updateMany({ where: { projectId, status: 'QUEUED' }, data: { status: 'FAILED', finishedAt: new Date() } }); await queue.cleanup(await SourceStore.open(root)); await client.project.delete({ where: { id: projectId } }); });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close(); if (root) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-code-context-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  const archive = () => zip([{ name: 'index.js', data: 'export const label = "<script>bad()</script>";\nmissing;\n' }]);
  async function enqueue(enabled = false) {
    let upload = owner.api.post(`/api/projects/${projectId}/analyses`);
    if (enabled) upload = upload.field('captureContext', 'true');
    return (await upload.attach('archive', archive(), 'project.zip').expect(202)).body.id as string;
  }
  async function analyze(enabled = false) { const id = await enqueue(enabled); await processNext(new AnalysisQueue(client), await SourceStore.open(root), 'context-test'); return id; }
  it('conserve les extraits uniquement sur demande et supprime les sources complètes', async () => {
    const id = await analyze(true); const result = await owner.api.get(`/api/analyses/${id}/context`).expect(200);
    expect(result.body.requested).toBe(true); expect(result.body.context.snippets[0].lines.map((line: { text: string }) => line.text).join('\n')).toContain('<script>bad()</script>');
    expect((await readdir(root))).toEqual([]);
    const stored = await client.analysis.findUniqueOrThrow({ where: { id } }); expect(stored.sourcesDeletedAt).not.toBeNull(); expect(stored.codeContext).not.toBeNull();
    const exported = (await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body;
    expect(exported.report).not.toHaveProperty('codeContext');
    await owner.api.delete(`/api/analyses/${id}/context`).expect(204);
    expect((await owner.api.get(`/api/analyses/${id}/context`).expect(200)).body).toEqual({ requested: false, context: null });
    expect((await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body).toEqual(exported);
  });
  it('ne capture rien par défaut', async () => { const id = await analyze(); expect((await owner.api.get(`/api/analyses/${id}/context`).expect(200)).body).toEqual({ requested: false, context: null }); });
  it('refuse l’accès anonyme, étranger et une suppression sans CSRF', async () => {
    const id = await analyze(true);
    await request(app.getHttpServer()).get(`/api/analyses/${id}/context`).expect(401);
    await other.api.get(`/api/analyses/${id}/context`).expect(404); await other.api.delete(`/api/analyses/${id}/context`).expect(404);
    await owner.api.delete(`/api/analyses/${id}/context`).set('X-CSRF-Token', '').expect(403);
    expect((await client.analysis.findUniqueOrThrow({ where: { id } })).codeContext).not.toBeNull();
  });
  it('valide le consentement et les champs supplémentaires', async () => {
    await owner.api.post(`/api/projects/${projectId}/analyses`).field('captureContext', 'maybe').attach('archive', archive(), 'project.zip').expect(400);
    await owner.api.post(`/api/projects/${projectId}/analyses`).field('unexpected', 'true').attach('archive', archive(), 'project.zip').expect(400);
    expect(await client.analysis.count({ where: { projectId } })).toBe(0);
  });
  it('refuse consultation et suppression tant que le travail est actif', async () => {
    const id = await enqueue(true); await owner.api.get(`/api/analyses/${id}/context`).expect(409); await owner.api.delete(`/api/analyses/${id}/context`).expect(409);
  });
  it('refuse un contexte corrompu plutôt que d’exposer des données non conformes', async () => {
    const id = await analyze(true); await client.analysis.update({ where: { id }, data: { codeContext: { unsafe: true } } });
    expect((await owner.api.get(`/api/analyses/${id}/context`).expect(409)).body.code).toBe('CODE_CONTEXT_INVALID');
  });
});
