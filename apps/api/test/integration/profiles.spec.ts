import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import { ANALYSIS_PROFILE_VERSION, STRICT_PROFILE_VERSION, analyzeProject } from '@codeaudit/analyzer';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { signedIn, clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
describe('Profils de règles — PostgreSQL et moteur réels', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>; let projectId: string; let root: string;
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-profiles-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app);
  });
  beforeEach(async () => { projectId = (await owner.api.post('/api/projects').send({ name: 'Controlled profiles' }).expect(201)).body.id as string; });
  afterEach(async () => { await client.project.deleteMany({ where: { id: projectId } }); });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close();
    if (root) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-profiles-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  const path = () => `/api/projects/${projectId}/rule-profile`;
  it('expose les profils contrôlés uniquement au propriétaire et protège les mutations', async () => {
    const response = await owner.api.get(path()).expect(200); expect(response.body.selectedVersion).toBe(ANALYSIS_PROFILE_VERSION); expect(response.body.profiles).toHaveLength(2);
    await other.api.get(path()).expect(404); await other.api.put(path()).send({ version: STRICT_PROFILE_VERSION }).expect(404);
    await owner.api.put(path()).set('X-CSRF-Token', '').send({ version: STRICT_PROFILE_VERSION }).expect(403);
    await owner.api.put(path()).send({ version: '../eslint.config.js' }).expect(400);
    await owner.api.put(path()).send({ version: STRICT_PROFILE_VERSION, rules: { 'no-console': 'off' } }).expect(400);
  });
  it('fige le choix avant exécution, applique les règles et conserve les anciens rapports', async () => {
    const archive = zip([{ name: 'index.ts', data: "console.log('hello');" }]);
    await owner.api.put(path()).send({ version: STRICT_PROFILE_VERSION }).expect(200);
    const strict = (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', archive, 'source.zip').expect(202)).body;
    expect(strict.profileVersion).toBe(STRICT_PROFILE_VERSION);
    await owner.api.put(path()).send({ version: ANALYSIS_PROFILE_VERSION }).expect(200);
    const base = (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', archive, 'source.zip').expect(202)).body;
    const queue = new AnalysisQueue(client); const store = await SourceStore.open();
    expect(await processNext(queue, store, 'profile-worker')).toBe(true); expect(await processNext(queue, store, 'profile-worker')).toBe(true);
    const strictResult = await owner.api.get(`/api/analyses/${strict.id}/results`).expect(200);
    const baseResult = await owner.api.get(`/api/analyses/${base.id}/results`).expect(200);
    expect(strictResult.body.statistics).toMatchObject({ errorCount: 1, warningCount: 0 }); expect(baseResult.body.statistics).toMatchObject({ errorCount: 0, warningCount: 1 });
    const exported = await owner.api.get(`/api/analyses/${strict.id}/report`).expect(200);
    expect(exported.body.report).toEqual((await client.analysis.findUniqueOrThrow({ where: { id: strict.id } })).report);
    expect(exported.body.report.profile.version).toBe(STRICT_PROFILE_VERSION);
    await owner.api.get(`/api/analyses/${base.id}/comparison?baselineId=${strict.id}`).expect(409);
  });
  it('ne remplace jamais un profil demandé inconnu par le profil par défaut', async () => {
    const analysis = (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', zip([{ name: 'index.js', data: 'export const answer = 42;' }]), 'source.zip').expect(202)).body;
    await client.analysis.update({ where: { id: analysis.id }, data: { profileVersion: 'unavailable-v999' } });
    await processNext(new AnalysisQueue(client), await SourceStore.open(), 'profile-worker');
    const stored = await client.analysis.findUniqueOrThrow({ where: { id: analysis.id } }); expect(stored.status).toBe('FAILED'); expect(stored.report).toBeNull(); expect(stored.errorCode).toBe('INVALID_OPTIONS');
  });
  it('refuse en base une version non publiée sur un projet', async () => {
    await expect(client.project.update({ where: { id: projectId }, data: { analysisProfileVersion: 'unpublished-v1' } })).rejects.toThrow();
    expect((await client.project.findUniqueOrThrow({ where: { id: projectId } })).analysisProfileVersion).toBe(ANALYSIS_PROFILE_VERSION);
  });
  it('refuse de publier un rapport dont le profil diffère de la demande réservée', async () => {
    await owner.api.put(path()).send({ version: STRICT_PROFILE_VERSION }).expect(200);
    const analysis = (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', zip([{ name: 'index.js', data: 'export const answer = 42;' }]), 'source.zip').expect(202)).body;
    const queue = new AnalysisQueue(client); const claim = await queue.claim('mismatched-profile'); expect(claim?.id).toBe(analysis.id);
    const report = await analyzeProject(resolve(__dirname, '../../../../packages/analyzer/test/fixtures/clean'));
    expect(await queue.succeed(claim!, report)).toBe(false);
    expect((await client.analysis.findUniqueOrThrow({ where: { id: analysis.id } })).report).toBeNull();
    await queue.fail(claim!, 'PROFILE_MISMATCH', 'Test controlled mismatch.');
  });
});
