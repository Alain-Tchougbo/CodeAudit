import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import { analyzeProject } from '@codeaudit/analyzer';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { signedIn, clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
describe('Annulation — PostgreSQL et worker réels', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>; let projectId: string; let root: string; let queue: AnalysisQueue; let store: SourceStore;
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-cancellation-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app); queue = new AnalysisQueue(client); store = await SourceStore.open();
  });
  beforeEach(async () => { projectId = (await owner.api.post('/api/projects').send({ name: 'Cancellation' }).expect(201)).body.id as string; });
  afterEach(async () => { await client.project.deleteMany({ where: { id: projectId } }); });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close();
    if (root) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-cancellation-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  async function enqueue(archive = zip([{ name: 'index.js', data: 'export const answer = 42;' }])) {
    return (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', archive, 'source.zip').expect(202)).body.id as string;
  }
  const cancel = (id: string) => owner.api.post(`/api/analyses/${id}/cancel`);
  it('refuse les comptes étrangers, les UUID absents et les mutations sans CSRF', async () => {
    const id = await enqueue(); await other.api.post(`/api/analyses/${id}/cancel`).expect(404); await cancel(randomUUID()).expect(404); await cancel(id).set('X-CSRF-Token', '').expect(403);
    expect((await client.analysis.findUniqueOrThrow({ where: { id } })).status).toBe('QUEUED'); await cancel(id).expect(202);
  });
  it('annule atomiquement une attente, reste idempotent et nettoie les sources', async () => {
    const baseline = (await owner.api.get('/api/dashboard').expect(200)).body; const id = await enqueue();
    const responses = await Promise.all([cancel(id), cancel(id)]); expect(responses.map(response => response.status)).toEqual([202, 202]);
    expect(await queue.claim('late-worker')).toBeNull(); await queue.cleanup(store);
    const stored = await client.analysis.findUniqueOrThrow({ where: { id } }); expect(stored.status).toBe('CANCELLED'); expect(stored.report).toBeNull(); expect(stored.errorCode).toBeNull(); expect(stored.sourcesDeletedAt).not.toBeNull();
    const history = (await owner.api.get(`/api/projects/${projectId}/analyses`).expect(200)).body; expect(history.items[0]).toMatchObject({ id, status: 'CANCELLED', finishedAt: expect.any(String) });
    expect((await owner.api.get(`/api/analyses/${id}/report`).expect(409)).body.code).toBe('ANALYSIS_CANCELLED'); await owner.api.get(`/api/analyses/${id}/results`).expect(409);
    const dashboard = (await owner.api.get('/api/dashboard').expect(200)).body; expect(dashboard.cancelledCount).toBe(baseline.cancelledCount + 1); expect(dashboard.failedCount).toBe(baseline.failedCount);
  });
  it('empêche une publication après demande d’arrêt et attend l’acquittement du worker', async () => {
    const id = await enqueue(); const claim = await queue.claim('reserved-worker'); expect(claim?.id).toBe(id);
    const response = await cancel(id).expect(202); expect(response.body.status).toBe('RUNNING'); expect(response.body.cancelRequestedAt).toEqual(expect.any(String));
    expect(await queue.heartbeat(id, claim!.lockToken)).toBe(false); expect(await queue.claim('second-worker')).toBeNull();
    const report = await analyzeProject(resolve(__dirname, '../../../../packages/analyzer/test/fixtures/clean'));
    expect(await queue.succeed(claim!, report)).toBe(false); expect((await client.analysis.findUniqueOrThrow({ where: { id } })).status).toBe('RUNNING');
    expect(await queue.fail(claim!, 'LEASE_LOST', 'Thread already stopped.')).toBe(true);
    expect((await client.analysis.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
  });
  it('récupère une annulation abandonnée sans réexécuter le travail', async () => {
    const id = await enqueue(); const claim = await queue.claim('interrupted-worker', { leaseMs: 60 }); await cancel(id).expect(202); await delay(100);
    expect(await queue.recoverExpired()).toBe(1); expect(await queue.claim('replacement-worker')).toBeNull(); expect(await queue.fail(claim!, 'STALE', 'Stale worker')).toBe(false);
    expect((await client.analysis.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'CANCELLED', errorCode: null, report: null }); await queue.cleanup(store);
  });
  it('interrompt un vrai thread moteur, puis supprime les sources sans rapport partiel', async () => {
    const archive = zip(Array.from({ length: 50 }, (_, index) => ({ name: `file-${index}.js`, data: Array.from({ length: 2000 }, (_, line) => `export const value${line} = ${line};`).join('\n') })));
    const id = await enqueue(archive); const task = processNext(queue, store, 'real-cancel-worker', { leaseMs: 300 });
    try {
      for (let attempt = 0; ; attempt++) {
        const record = await client.analysis.findUniqueOrThrow({ where: { id } });
        if (record.status === 'RUNNING' && record.heartbeatAt! > record.startedAt!) break;
        if (attempt > 300 || ['SUCCEEDED', 'FAILED'].includes(record.status)) throw new Error('Worker did not remain active before cancellation');
        await delay(10);
      }
      await cancel(id).expect(202);
    } finally { await task; }
    const stored = await client.analysis.findUniqueOrThrow({ where: { id } }); expect(stored.status).toBe('CANCELLED'); expect(stored.report).toBeNull(); expect(stored.statistics).toBeNull(); expect(stored.sourcesDeletedAt).not.toBeNull();
  });
  it('préserve les rapports déjà terminés face à une annulation tardive', async () => {
    const id = await enqueue(); await processNext(queue, store, 'completed-worker');
    const before = (await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body; await cancel(id).expect(409);
    expect((await owner.api.get(`/api/analyses/${id}/report`).expect(200)).body).toEqual(before);
  });
  it('résout la course entre réservation et annulation sans double traitement', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = await enqueue(); const [claim, response] = await Promise.all([queue.claim(`racing-worker-${attempt}`), cancel(id)]);
      expect(response.status).toBe(202);
      if (claim) { expect(claim.id).toBe(id); expect(await queue.heartbeat(id, claim.lockToken)).toBe(false); await queue.fail(claim, 'STOPPED', 'No engine started.'); }
      expect((await client.analysis.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
      expect(await queue.claim('other-worker')).toBeNull(); await queue.cleanup(store);
    }
  });
});
