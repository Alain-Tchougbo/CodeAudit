import 'reflect-metadata';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { AnalysisComparison } from '@codeaudit/contracts';
import { Prisma, type PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { signedIn, clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';

jest.setTimeout(60000);
describe('Comparaison — PostgreSQL réel et rapports du moteur', () => {
  let app: INestApplication; let client: PrismaClient; let root: string;
  let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>;
  let projectId: string; let baselineId: string; let targetId: string;
  const projectIds: string[] = [];
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-comparison-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app);
  });
  async function analyzed(source: string, filePath = 'index.js') {
    const response = await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', zip([{ name: filePath, data: source }]), 'project.zip').expect(202);
    await processNext(new AnalysisQueue(client), await SourceStore.open(root), 'comparison-test');
    expect((await owner.api.get(`/api/analyses/${response.body.id}`).expect(200)).body.status).toBe('SUCCEEDED');
    return response.body.id as string;
  }
  beforeEach(async () => {
    projectId = (await client.project.create({ data: { name: 'Comparison', ownerId: owner.userId } })).id; projectIds.push(projectId);
    baselineId = await analyzed('missing;\nconsole.log("before");');
    targetId = await analyzed('\nmissing;\ndebugger;');
  });
  afterEach(async () => { await client.project.deleteMany({ where: { id: { in: projectIds.splice(0) } } }); });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close();
    if (root) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-comparison-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  const path = (target: string, baseline: string) => `/api/analyses/${target}/comparison?baselineId=${baseline}`;
  it('compare les rapports persistés sans les modifier et donne un sens explicite à l’inversion', async () => {
    const before = await client.analysis.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
    const result = (await owner.api.get(path(targetId, baselineId)).expect(200)).body as AnalysisComparison;
    expect(result.counts).toEqual({ added: 1, persistent: 1, resolved: 1, moved: 1 });
    expect(result.added[0]?.ruleId).toBe('no-debugger'); expect(result.resolved[0]?.ruleId).toBe('no-console');
    expect(result.persistent[0]).toMatchObject({ baseline: { line: 1 }, target: { line: 2 }, positionChanged: true });
    expect(result.deltas).toMatchObject({ errorCount: 1, warningCount: -1, analyzedFileCount: 0 });
    expect((await owner.api.get(path(baselineId, targetId)).expect(200)).body.deltas).toMatchObject({ errorCount: -1, warningCount: 1 });
    expect(await client.analysis.findMany({ where: { projectId }, orderBy: { id: 'asc' } })).toEqual(before);
  });
  it('signale les changements de fichiers analysés', async () => {
    const id = await analyzed('export {};', 'replacement.js');
    expect((await owner.api.get(path(id, baselineId)).expect(200)).body.coverage).toEqual({ newlyAnalyzedFiles: ['replacement.js'], noLongerAnalyzedFiles: ['index.js'] });
  });
  it('compare deux rapports sans diagnostic et retourne des compteurs nuls', async () => {
    const first = await analyzed('export const value = 1;');
    const second = await analyzed('export const value = 2;');
    const result = (await owner.api.get(path(second, first)).expect(200)).body as AnalysisComparison;
    expect(result.counts).toEqual({ added: 0, persistent: 0, resolved: 0, moved: 0 });
    expect(result.added).toEqual([]); expect(result.resolved).toEqual([]); expect(result.persistent).toEqual([]);
  });
  it('refuse les appels anonymes et les identifiants étrangers dans les deux sens', async () => {
    await request(app.getHttpServer()).get(path(targetId, baselineId)).expect(401);
    await other.api.get(path(targetId, baselineId)).expect(404);
    const foreignProject = await client.project.create({ data: { name: 'Other', ownerId: other.userId } }); projectIds.push(foreignProject.id);
    const foreign = await client.analysis.create({ data: { projectId: foreignProject.id } });
    await owner.api.get(path(targetId, foreign.id)).expect(404); await owner.api.get(path(foreign.id, baselineId)).expect(404);
    await owner.api.get(path(foreign.id, foreign.id)).expect(404);
  });
  it('valide UUID, paramètre obligatoire, champs inconnus et analyses différentes', async () => {
    await owner.api.get(path('invalid', baselineId)).expect(400); await owner.api.get(path(targetId, 'invalid')).expect(400);
    await owner.api.get(`/api/analyses/${targetId}/comparison`).expect(400);
    await owner.api.get(`${path(targetId, baselineId)}&extra=1`).expect(400);
    expect((await owner.api.get(path(targetId, targetId)).expect(400)).body.code).toBe('SAME_ANALYSIS');
    await owner.api.get(path(targetId, randomUUID())).expect(404);
  });
  it('refuse deux projets différents même détenus par le même compte', async () => {
    const project = await client.project.create({ data: { name: 'Different', ownerId: owner.userId } }); projectIds.push(project.id);
    const analysis = await client.analysis.create({ data: { projectId: project.id } });
    expect((await owner.api.get(path(targetId, analysis.id)).expect(400)).body.code).toBe('DIFFERENT_PROJECTS');
  });
  it.each(['QUEUED', 'RUNNING', 'FAILED'] as const)('refuse un état %s dans les deux positions', async (status) => {
    const record = await client.analysis.create({ data: { projectId, status } });
    await owner.api.get(path(targetId, record.id)).expect(409); await owner.api.get(path(record.id, baselineId)).expect(409);
  });
  it.each(['profile', 'engine', 'limits'] as const)('refuse des paramètres différents (%s)', async (change) => {
    const record = await client.analysis.findUniqueOrThrow({ where: { id: targetId } });
    const report = JSON.parse(JSON.stringify(record.report)) as Parameters<AnalysisQueue['succeed']>[1];
    if (change === 'profile') report.profile.rules.javascript['no-debugger'] = 'warn';
    if (change === 'engine') report.profile.engines.eslint = '0.0.0-test';
    if (change === 'limits') report.limits.maxEntries += 1;
    await client.$executeRaw(Prisma.sql`UPDATE "Analysis" SET report = ${JSON.stringify(report)}::jsonb WHERE id = ${targetId}::uuid`);
    expect((await owner.api.get(path(targetId, baselineId)).expect(409)).body.code).toBe('INCOMPATIBLE_ANALYSES');
  });
  it('refuse un rapport incomplet ou incohérent', async () => {
    const stored = await client.analysis.findUniqueOrThrow({ where: { id: targetId } });
    await client.analysis.update({ where: { id: targetId }, data: { report: {} } });
    expect((await owner.api.get(path(targetId, baselineId)).expect(409)).body.code).toBe('REPORT_SCHEMA_INVALID');
    await client.$executeRaw(Prisma.sql`UPDATE "Analysis" SET report = ${JSON.stringify(stored.report)}::jsonb, statistics = '{}'::jsonb WHERE id = ${targetId}::uuid`);
    expect((await owner.api.get(path(targetId, baselineId)).expect(409)).body.code).toBe('REPORT_INCONSISTENT');
  });
});
