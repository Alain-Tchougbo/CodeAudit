import 'reflect-metadata';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
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
describe('Seuils, clés et CLI — PostgreSQL, HTTP et worker réels', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>; let projectId: string; let root: string; let apiUrl: string;
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  const children: ChildProcess[] = [];
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-quality-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.listen(0, '127.0.0.1'); apiUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`; client = app.get(PrismaService).client;
    owner = await signedIn(app); other = await signedIn(app);
  });
  beforeEach(async () => { projectId = (await owner.api.post('/api/projects').send({ name: 'Quality CI' }).expect(201)).body.id as string; });
  afterEach(async () => {
    for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit', { signal: AbortSignal.timeout(5000) }); child.kill('SIGTERM'); await exited; }
    await client.project.deleteMany({ where: { id: projectId } });
  });
  afterAll(async () => {
    if (client && owner && other) { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, [owner.email, other.email]); }
    if (app) await app.close(); if (root) { if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-quality-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  const policyPath = () => `/api/projects/${projectId}/quality-policy`; const keysPath = () => `/api/projects/${projectId}/api-keys`;
  const policy = (warnings = 0) => owner.api.put(policyPath()).send({ enabled: true, maxErrors: 0, maxWarnings: warnings }).expect(200);
  const key = async () => (await owner.api.post(keysPath()).send({ name: 'CI test', expiresInDays: 1 }).expect(201)).body as { token: string; key: { id: string } };
  async function enqueue(source = "console.log('hello');") { return (await owner.api.post(`/api/projects/${projectId}/analyses`).attach('archive', zip([{ name: 'index.js', data: source }]), 'source.zip').expect(202)).body.id as string; }
  async function work() { return processNext(new AnalysisQueue(client), await SourceStore.open(), 'quality-worker'); }
  it('protège les réglages et valide les valeurs', async () => {
    expect((await owner.api.get(policyPath()).expect(200)).body.policy).toBeNull(); await other.api.get(policyPath()).expect(404);
    await other.api.put(policyPath()).send({ enabled: true, maxErrors: 0, maxWarnings: 0 }).expect(404);
    await owner.api.put(policyPath()).set('X-CSRF-Token', '').send({ enabled: true, maxErrors: 0, maxWarnings: 0 }).expect(403);
    for (const maxErrors of [-1, 1.5, '0', 1000001, null]) await owner.api.put(policyPath()).send({ enabled: true, maxErrors, maxWarnings: 0 }).expect(400);
  });
  it('fige les seuils avant traitement et garde SUCCEEDED malgré un refus qualité', async () => {
    await policy(); const id = await enqueue(); await policy(10); await work();
    expect((await client.analysis.findUniqueOrThrow({ where: { id } })).status).toBe('SUCCEEDED');
    const gate = (await owner.api.get(`/api/analyses/${id}/quality-gate`).expect(200)).body; expect(gate.status).toBe('FAIL'); expect(gate.policy.maxWarnings).toBe(0); expect(gate.observed.warningCount).toBe(1);
    await other.api.get(`/api/analyses/${id}/quality-gate`).expect(404); const newer = await enqueue(); await work(); expect((await owner.api.get(`/api/analyses/${newer}/quality-gate`).expect(200)).body.status).toBe('PASS');
    expect((await owner.api.get(`/api/analyses/${id}/quality-gate`).expect(200)).body).toEqual(gate);
  });
  it('ne rétroapplique pas un nouveau seuil et refuse un snapshot corrompu', async () => {
    const id = await enqueue('export const answer = 42;'); await work(); await policy(); expect((await owner.api.get(`/api/analyses/${id}/quality-gate`).expect(200)).body.status).toBe('NOT_CONFIGURED');
    await client.analysis.update({ where: { id }, data: { qualityPolicySnapshot: { schemaVersion: 999 } } }); await owner.api.get(`/api/analyses/${id}/quality-gate`).expect(409);
  });
  it('stocke uniquement un condensat et refuse les capacités de session aux clés CI', async () => {
    const created = await key(); const stored = await client.apiKey.findUniqueOrThrow({ where: { id: created.key.id } }); expect(stored.tokenHash).toBe(createHash('sha256').update(created.token).digest('hex'));
    const listed = await owner.api.get(keysPath()).expect(200); expect(JSON.stringify(listed.body)).not.toContain(created.token); expect(JSON.stringify(listed.body)).not.toContain('tokenHash');
    await other.api.get(keysPath()).expect(404); await other.api.delete(`${keysPath()}/${created.key.id}`).expect(404);
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${created.token}`).expect(401); await owner.api.get('/api/auth/me').set('Authorization', `Bearer ${created.token}`).expect(401);
    await request(app.getHttpServer()).patch(`/api/projects/${projectId}`).set('Authorization', `Bearer ${created.token}`).send({ name: 'Forbidden' }).expect(401);
  });
  it('limite la clé à un projet même lorsque le compte possède plusieurs projets', async () => {
    const created = await key(); const second = await client.project.create({ data: { name: 'Other owned project', ownerId: owner.userId } });
    try {
      const foreign = await client.analysis.create({ data: { projectId: second.id, status: 'FAILED' } });
      for (const suffix of ['', '/report', '/quality-gate']) await request(app.getHttpServer()).get(`/api/analyses/${foreign.id}${suffix}`).set('Authorization', `Bearer ${created.token}`).expect(404);
      await request(app.getHttpServer()).post(`/api/projects/${second.id}/analyses`).set('Authorization', `Bearer ${created.token}`).attach('archive', zip([{ name: 'index.js', data: 'debugger;' }]), 'source.zip').expect(404);
      const response = await request(app.getHttpServer()).post(`/api/projects/${projectId}/analyses`).set('Authorization', `Bearer ${created.token}`).attach('archive', zip([{ name: 'index.js', data: 'export const answer = 42;' }]), 'source.zip').expect(202);
      await work(); await request(app.getHttpServer()).get(`/api/analyses/${response.body.id}/report`).set('Authorization', `Bearer ${created.token}`).expect(200);
      await request(app.getHttpServer()).get(`/api/analyses/${response.body.id}/context`).set('Authorization', `Bearer ${created.token}`).expect(401);
      await owner.api.delete(`${keysPath()}/${created.key.id}`).expect(204); await request(app.getHttpServer()).get(`/api/analyses/${response.body.id}`).set('Authorization', `Bearer ${created.token}`).expect(401);
    } finally { await client.project.delete({ where: { id: second.id } }); }
  });
  it('refuse une clé expirée', async () => {
    const created = await key(); const id = await enqueue(); await client.apiKey.update({ where: { id: created.key.id }, data: { createdAt: new Date(Date.now() - 2 * 86400000), expiresAt: new Date(Date.now() - 86400000) } });
    await request(app.getHttpServer()).get(`/api/analyses/${id}`).set('Authorization', `Bearer ${created.token}`).expect(401);
  });
  it.each([{ maximum: 0, source: 'export const answer = 42;', exit: 0, decision: 'PASS' }, { maximum: 0, source: "console.log('hello');", exit: 1, decision: 'FAIL' }, { maximum: null, source: 'export const answer = 42;', exit: 2, decision: 'NOT_CONFIGURED' }])('exécute le CLI réel avec code $exit', async example => {
    if (example.maximum !== null) await policy(example.maximum); const created = await key(); const archivePath = resolve(root, `input-${example.exit}.zip`); const reportPath = resolve(root, `report-${example.exit}.json`); await writeFile(archivePath, zip([{ name: 'index.js', data: example.source }]));
    const child = spawn(process.execPath, [resolve(__dirname, '../../../../tools/codeaudit-ci.mts'), '--api-url', apiUrl, '--project', example.exit === 0 ? projectId.toUpperCase() : projectId, '--archive', archivePath, '--report', reportPath], { env: { ...process.env, CODEAUDIT_TOKEN: created.token, CODEAUDIT_WAIT_MS: '45000', CODEAUDIT_POLL_MS: '100' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    children.push(child);
    let stdout = ''; let stderr = ''; child.stdout.on('data', chunk => { stdout += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
    const finished = new Promise<number | null>((resolveExit, reject) => { child.once('exit', resolveExit); child.once('error', reject); });
    for (let attempt = 0; await client.analysis.count({ where: { projectId, status: 'QUEUED' } }) === 0; attempt++) { if (attempt > 1000 || child.exitCode !== null) throw new Error('CLI did not enqueue its analysis'); await new Promise(resolveDelay => setTimeout(resolveDelay, 10)); }
    await work(); expect(await finished).toBe(example.exit); expect(stdout + stderr).not.toContain(created.token);
    const summary = JSON.parse(stdout.trim()) as { analysisId: string; qualityGate: string }; const report = JSON.parse(await readFile(reportPath, 'utf8')); expect(report).toEqual((await owner.api.get(`/api/analyses/${summary.analysisId}/report`).expect(200)).body);
    const gate = JSON.parse(await readFile(`${reportPath}.gate.json`, 'utf8')); expect(gate).toEqual((await owner.api.get(`/api/analyses/${summary.analysisId}/quality-gate`).expect(200)).body); expect(gate.status).toBe(example.decision);
  });
  it('révoque aussi les clés CI lors d’une récupération de mot de passe', async () => {
    const account = await signedIn(app); const project = await client.project.create({ data: { name: 'Password reset CI', ownerId: account.userId } });
    try {
      const created = (await account.api.post(`/api/projects/${project.id}/api-keys`).send({ name: 'Reset key', expiresInDays: 1 }).expect(201)).body; const token = randomBytes(32).toString('hex');
      await client.passwordResetToken.create({ data: { userId: account.userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000) } });
      await request(app.getHttpServer()).post('/api/auth/reset-password').set('X-CodeAudit-Request', '1').send({ token, password: 'A recovered passphrase 2026!' }).expect(204); expect(await client.apiKey.count({ where: { userId: account.userId } })).toBe(0);
      expect(created.token).toMatch(/^ca_/);
    } finally { await client.project.delete({ where: { id: project.id } }); await client.user.delete({ where: { id: account.userId } }); await clearTestThrottle(client, [account.email]); }
  });
});
