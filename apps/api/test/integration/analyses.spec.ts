import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createDatabaseClient, type PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';

async function assertStorageRoot(root: string): Promise<void> {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-execution-')) throw new Error('Unsafe cleanup');
}

jest.setTimeout(30000);
type Report = Parameters<AnalysisQueue['succeed']>[1];

describe('Exécution des analyses — PostgreSQL réel', () => {
  let app: INestApplication;
  let client: PrismaClient;
  let secondClient: PrismaClient;
  let queue: AnalysisQueue;
  let secondQueue: AnalysisQueue;
  let store: SourceStore;
  let storageRoot: string;
  let projectId: string;
  const projectIds: string[] = [];
  const children: ChildProcess[] = [];
  const oldUrl = process.env.DATABASE_URL;
  const oldStorage = process.env.CODEAUDIT_STORAGE_ROOT;
  const testUrl = process.env.TEST_DATABASE_URL;
  const workspace = resolve(__dirname, '../../../..');

  beforeAll(async () => {
    if (!testUrl || !/^\/[^/]+_test$/.test(new URL(testUrl).pathname)) throw new Error('TEST_DATABASE_URL doit cibler une base dédiée _test.');
    storageRoot = await mkdtemp(resolve(tmpdir(), 'codeaudit-execution-'));
    process.env.DATABASE_URL = testUrl;
    process.env.CODEAUDIT_STORAGE_ROOT = storageRoot;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    client = app.get(PrismaService).client;
    secondClient = createDatabaseClient(testUrl);
    await secondClient.$connect();
    queue = new AnalysisQueue(client);
    secondQueue = new AnalysisQueue(secondClient);
    store = await SourceStore.open(storageRoot);
  });

  beforeEach(async () => {
    const project = await client.project.create({ data: { name: 'execution-' + randomUUID() } });
    projectId = project.id;
    projectIds.push(project.id);
  });

  async function stopChild(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM') {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = new Promise<void>((done) => child.once('exit', () => done()));
    child.kill(signal);
    const timeout = new AbortController();
    const exited = await Promise.race([exit.then(() => true), delay(5000, undefined, { signal: timeout.signal }).then(() => false, () => true)]);
    timeout.abort();
    if (!exited) { child.kill('SIGKILL'); await exit; }
  }

  afterEach(async () => {
    for (const child of children.splice(0)) await stopChild(child);
    const records = await client.analysis.findMany({ where: { projectId: { in: projectIds } }, select: { sourceKey: true } });
    for (const record of records) if (record.sourceKey) await store.remove(record.sourceKey);
    await client.analysis.deleteMany({ where: { projectId: { in: projectIds } } });
  });

  afterAll(async () => {
    try {
      if (client) await client.project.deleteMany({ where: { id: { in: projectIds } } });
    } finally {
      if (secondClient) await secondClient.$disconnect();
      if (app) await app.close();
      if (storageRoot) {
        await assertStorageRoot(storageRoot);
        await rm(storageRoot, { recursive: true, force: true });
      }
      if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
      if (oldStorage === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldStorage;
    }
  });

  async function enqueue(data: string | Buffer = 'const unused = 1;\ndebugger;\n') {
    const response = await request(app.getHttpServer()).post(`/api/projects/${projectId}/analyses`)
      .attach('archive', zip([{ name: 'src/index.js', data }]), 'sources.zip').expect(202);
    return response.body as { id: string; status: string };
  }

  async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 20000): Promise<T> {
    const deadline = Date.now() + timeout;
    let value: T;
    do {
      value = await read();
      if (accept(value)) return value;
      await delay(25);
    } while (Date.now() < deadline);
    throw new Error('État attendu non atteint dans le délai.');
  }

  function launchWorker(): ChildProcess {
    const child = spawn(process.execPath, [resolve(workspace, 'apps/worker/dist/index.js')], {
      cwd: workspace, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, DATABASE_URL: testUrl!, CODEAUDIT_STORAGE_ROOT: storageRoot },
    });
    child.on('error', () => {});
    children.push(child);
    return child;
  }

  it('accepte le ZIP, expose QUEUED, puis persiste SUCCEEDED même avec des erreurs de code', async () => {
    const queued = await enqueue();
    expect(queued.status).toBe('QUEUED');
    const pending = await request(app.getHttpServer()).get(`/api/analyses/${queued.id}`).expect(200);
    expect(pending.body).toMatchObject({ status: 'QUEUED', statistics: null, error: null });
    expect(pending.body).not.toHaveProperty('sourceKey');
    expect(pending.body).not.toHaveProperty('lockToken');
    await request(app.getHttpServer()).get(`/api/analyses/${queued.id}/results`).expect(409);
    expect(await processNext(queue, store, 'worker-a')).toBe(true);
    const state = await request(app.getHttpServer()).get(`/api/analyses/${queued.id}`).expect(200);
    expect(state.body).toMatchObject({ status: 'SUCCEEDED', statistics: { errorCount: 1, warningCount: 1 }, error: null });
    const report = await request(app.getHttpServer()).get(`/api/analyses/${queued.id}/results`).expect(200);
    expect(report.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'no-debugger', filePath: 'src/index.js' })]));
    const stored = await client.analysis.findUniqueOrThrow({ where: { id: queued.id } });
    expect(stored.report).toEqual(report.body);
    expect(stored.sourceKey).toBeNull();
    expect(stored.sourcesDeletedAt).not.toBeNull();
    expect(await readdir(storageRoot)).toEqual([]);
  });

  it('pagine un historique limité au projet', async () => {
    const first = await enqueue('export const a = 1;');
    const second = await enqueue('export const b = 1;');
    const page = await request(app.getHttpServer()).get(`/api/projects/${projectId}/analyses?limit=1`).expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toBeTruthy();
    const next = await request(app.getHttpServer()).get(`/api/projects/${projectId}/analyses?limit=1&cursor=${page.body.nextCursor}`).expect(200);
    expect(next.body.items).toHaveLength(1);
    expect(new Set([page.body.items[0].id, next.body.items[0].id])).toEqual(new Set([first.id, second.id]));
    expect(next.body.nextCursor).toBeNull();
    await request(app.getHttpServer()).get(`/api/projects/${projectId}/analyses?limit=101`).expect(400);
    await request(app.getHttpServer()).get(`/api/projects/${projectId}/analyses?cursor=${randomUUID()}`).expect(400);
  });

  it('calcule les indicateurs globaux depuis les données persistées et exclut les échecs des diagnostics', async () => {
    const baseline = (await request(app.getHttpServer()).get('/api/dashboard').expect(200)).body;
    await client.analysis.createMany({ data: [
      { projectId, status: 'QUEUED' }, { projectId, status: 'RUNNING' },
      { projectId, status: 'FAILED', statistics: { errorCount: 99, warningCount: 99 } },
      { projectId, status: 'SUCCEEDED', statistics: { errorCount: 3, warningCount: 7 } },
    ] });
    const response = (await request(app.getHttpServer()).get('/api/dashboard').expect(200)).body;
    expect(response).toMatchObject({
      projectCount: baseline.projectCount, analysisCount: baseline.analysisCount + 4,
      completedCount: baseline.completedCount + 2, succeededCount: baseline.succeededCount + 1,
      failedCount: baseline.failedCount + 1, queuedCount: baseline.queuedCount + 1, runningCount: baseline.runningCount + 1,
      errorCount: baseline.errorCount + 3, warningCount: baseline.warningCount + 7,
    });
    expect(response.latestAnalyses.some((item: { projectId: string }) => item.projectId === projectId)).toBe(true);
    expect(response.latestAnalyses[0]).toHaveProperty('projectName');
    expect(response.latestAnalyses[0]).not.toHaveProperty('report');
    expect(response.latestAnalyses[0]).not.toHaveProperty('lockToken');
    await client.analysis.deleteMany({ where: { projectId } });
    expect((await request(app.getHttpServer()).get('/api/dashboard').expect(200)).body).toEqual(baseline);
  });

  it('borne les dernières analyses à dix et applique un ordre stable', async () => {
    await client.analysis.createMany({ data: Array.from({ length: 12 }, () => ({ projectId })) });
    const response = (await request(app.getHttpServer()).get('/api/dashboard').expect(200)).body;
    expect(response.latestAnalyses).toHaveLength(10);
    const expected = await client.analysis.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10 });
    expect(response.latestAnalyses.map((item: { id: string }) => item.id)).toEqual(expected.map((item) => item.id));
  });

  it('renvoie 404 pour un projet ou une analyse absents', async () => {
    await request(app.getHttpServer()).get(`/api/analyses/${randomUUID()}`).expect(404);
    await request(app.getHttpServer()).get(`/api/analyses/${randomUUID()}/results`).expect(404);
    await request(app.getHttpServer()).get(`/api/projects/${randomUUID()}/analyses`).expect(404);
    await request(app.getHttpServer()).post(`/api/projects/${randomUUID()}/analyses`)
      .attach('archive', zip([{ name: 'index.js', data: 'export {};' }]), 'sources.zip').expect(404);
  });

  it('refuse une archive absente, malveillante ou dépassant la limite HTTP sans créer de travail', async () => {
    await request(app.getHttpServer()).post(`/api/projects/${projectId}/analyses`).expect(400);
    await request(app.getHttpServer()).post(`/api/projects/${projectId}/analyses`)
      .attach('archive', zip([{ name: '../outside.js', data: 'debugger;' }]), 'bad.zip').expect(400);
    await request(app.getHttpServer()).post(`/api/projects/${projectId}/analyses`)
      .attach('archive', Buffer.alloc(10 * 1024 * 1024 + 1), 'large.zip').expect(413);
    expect(await client.analysis.count({ where: { projectId } })).toBe(0);
    expect(await readdir(storageRoot)).toEqual([]);
  });

  it('ne réserve une même analyse qu’une fois parmi vingt réservations concurrentes', async () => {
    const queued = await enqueue();
    const claims = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? queue : secondQueue).claim('worker-' + index)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.id).toBe(queued.id);
    expect(await queue.claim('late-worker')).toBeNull();
  });

  it('répartit plusieurs travaux sans doublon entre des connexions PostgreSQL distinctes', async () => {
    const ids = [];
    for (let index = 0; index < 5; index++) ids.push((await client.analysis.create({ data: { projectId } })).id);
    const claims = await Promise.all(Array.from({ length: 15 }, (_, index) => (index % 2 ? queue : secondQueue).claim('worker-' + index)));
    const claimedIds = claims.filter((claim) => claim !== null).map((claim) => claim.id);
    expect(claimedIds).toHaveLength(5);
    expect(new Set(claimedIds)).toEqual(new Set(ids));
  });

  it('deux workers concurrents ne lancent pas la même analyse', async () => {
    const queued = await enqueue('export const value = 1;');
    const results = await Promise.all([processNext(queue, store, 'a'), processNext(secondQueue, store, 'b')]);
    expect(results.sort()).toEqual([false, true]);
    expect((await client.analysis.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('SUCCEEDED');
  });

  it('renouvelle le heartbeat et refuse les jetons étrangers ou expirés', async () => {
    await enqueue();
    const claim = (await queue.claim('a'))!;
    expect(await secondQueue.heartbeat(claim.id, randomUUID())).toBe(false);
    expect(await queue.heartbeat(claim.id, claim.lockToken)).toBe(true);
    await client.analysis.update({ where: { id: claim.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    expect(await queue.heartbeat(claim.id, claim.lockToken)).toBe(false);
    expect(await queue.recoverExpired()).toBe(1);
    expect(await queue.fail(claim, 'STALE', 'Old worker')).toBe(false);
  });

  it('interdit la publication d’un ancien résultat après perte de réservation et garde l’état terminal immuable', async () => {
    const successful = await enqueue('export const value = 1;');
    await processNext(queue, store, 'a');
    const reference = (await request(app.getHttpServer()).get(`/api/analyses/${successful.id}/results`).expect(200)).body as Report;
    const queued = await enqueue();
    const claim = (await queue.claim('old-worker'))!;
    await client.analysis.update({ where: { id: queued.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await secondQueue.recoverExpired();
    expect(await queue.succeed(claim, reference)).toBe(false);
    expect(await queue.fail(claim, 'OLD', 'Old worker')).toBe(false);
    const state = await client.analysis.findUniqueOrThrow({ where: { id: queued.id } });
    expect(state).toMatchObject({ status: 'FAILED', errorCode: 'WORKER_INTERRUPTED', report: null });
    expect(await queue.claim('new-worker')).toBeNull();
  });

  it('arrête le calcul à l’interruption du worker et conserve un échec explicite', async () => {
    const queued = await enqueue('export const value = 1;');
    const stop = new AbortController();
    const processing = processNext(queue, store, 'a', { signal: stop.signal });
    await waitFor(() => client.analysis.findUniqueOrThrow({ where: { id: queued.id } }), (item) => item.status === 'RUNNING');
    stop.abort();
    await processing;
    expect(await client.analysis.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'WORKER_INTERRUPTED', report: null, sourceKey: null });
  });

  it('enregistre un timeout et supprime les sources après arrêt effectif', async () => {
    const queued = await enqueue('export const value = 1;');
    await processNext(queue, store, 'a', { analysisMs: 1 });
    expect(await client.analysis.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'ANALYSIS_TIMEOUT', report: null, sourceKey: null });
  });

  it('enregistre une erreur technique si les sources ont disparu', async () => {
    const queued = await enqueue();
    const record = await client.analysis.findUniqueOrThrow({ where: { id: queued.id } });
    await store.remove(record.sourceKey!);
    await processNext(queue, store, 'a');
    expect(await client.analysis.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'SOURCE_MISSING', report: null });
  });

  it('distingue une entrée non analysable d’un résultat sans problèmes', async () => {
    const queued = await enqueue(Buffer.from([0, 1, 2]));
    await processNext(queue, store, 'a');
    expect(await client.analysis.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'NO_SUPPORTED_FILES', report: null });
    await request(app.getHttpServer()).get(`/api/analyses/${queued.id}/results`).expect(409);
  });

  it('récupère un travail après arrêt brutal réel du processus et traite une nouvelle tentative avec un autre identifiant', async () => {
    const abandoned = await enqueue('export const value = 1;');
    const firstWorker = launchWorker();
    const running = await waitFor(() => client.analysis.findUniqueOrThrow({ where: { id: abandoned.id } }), (item) => item.status === 'RUNNING');
    await stopChild(firstWorker, 'SIGKILL');
    await client.analysis.update({ where: { id: abandoned.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const retry = await enqueue('export const value = 2;');
    expect(retry.id).not.toBe(abandoned.id);
    const replacement = launchWorker();
    const recovered = await waitFor(() => client.analysis.findUniqueOrThrow({ where: { id: abandoned.id } }), (item) => item.status === 'FAILED');
    expect(recovered.errorCode).toBe('WORKER_INTERRUPTED');
    expect(recovered.report).toBeNull();
    await waitFor(() => client.analysis.findUniqueOrThrow({ where: { id: retry.id } }), (item) => item.status === 'SUCCEEDED' && item.sourceKey === null);
    expect(await queue.heartbeat(abandoned.id, running.lockToken!)).toBe(false);
    await stopChild(replacement);
    expect(await readdir(storageRoot)).toEqual([]);
  });

  it('retente le nettoyage sans modifier les résultats terminaux', async () => {
    const queued = await enqueue();
    const claim = (await queue.claim('a'))!;
    await queue.fail(claim, 'TEST_FAILURE', 'Échec contrôlé');
    const remove = jest.spyOn(store, 'remove').mockRejectedValueOnce(new Error('temporary filesystem failure'));
    expect(await queue.cleanup(store)).toMatchObject({ removed: 0, errors: 1 });
    expect((await client.analysis.findUniqueOrThrow({ where: { id: queued.id } })).sourceKey).not.toBeNull();
    remove.mockRestore();
    expect(await queue.cleanup(store)).toMatchObject({ removed: 1, errors: 0 });
    expect(await client.analysis.findUniqueOrThrow({ where: { id: queued.id } }))
      .toMatchObject({ status: 'FAILED', errorCode: 'TEST_FAILURE', sourceKey: null });
  });
});
