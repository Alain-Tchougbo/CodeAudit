import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import request from 'supertest';
import { AnalysisQueue, SourceStore, processNext } from '@codeaudit/analysis-jobs';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { digest, throttleKey } from '../../src/auth/auth.service';
import { verifyPassword } from '../../src/auth/password';
import { clearTestThrottle } from './auth-helper';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
const password = 'A long test passphrase 2026!';
describe('Authentification et isolation — PostgreSQL reel', () => {
  let app: INestApplication; let client: PrismaClient; let root: string;
  const users: string[] = []; const emails: string[] = []; const legacy: string[] = [];
  const oldUrl = process.env.DATABASE_URL; const oldRoot = process.env.CODEAUDIT_STORAGE_ROOT;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || !/^\/[^/]+_test$/.test(new URL(process.env.TEST_DATABASE_URL).pathname)) throw new Error('Dedicated _test database required.');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    root = await mkdtemp(resolve(tmpdir(), 'codeaudit-auth-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
  });
  afterEach(async () => {
    await client.project.deleteMany({ where: { OR: [{ ownerId: { in: users } }, { id: { in: legacy } }] } });
    await client.user.deleteMany({ where: { id: { in: users } } }); await clearTestThrottle(client, emails);
    users.length = 0; emails.length = 0; legacy.length = 0;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (root) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-auth-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    if (oldRoot === undefined) delete process.env.CODEAUDIT_STORAGE_ROOT; else process.env.CODEAUDIT_STORAGE_ROOT = oldRoot;
  });
  async function signup() {
    const api = request.agent(app.getHttpServer()); const email = `auth-${randomUUID()}@example.test`; emails.push(email);
    const response = await api.post('/api/auth/register').set('X-CodeAudit-Request', '1').send({ name: ' Alice ', email: ` ${email.toUpperCase()} `, password }).expect(201);
    const id = response.body.user.id as string; users.push(id);
    api.set('X-CodeAudit-Request', '1'); api.set('X-CSRF-Token', response.body.csrfToken as string);
    const cookie = (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    return { api, id, email, response, cookie };
  }
  it.each(['/api/projects', '/api/dashboard', '/api/auth/me', `/api/analyses/${randomUUID()}`, `/api/analyses/${randomUUID()}/results`, `/api/analyses/${randomUUID()}/report`, `/api/projects/${randomUUID()}/analyses`])('protege le GET anonyme %s', async (path) => {
    expect((await request(app.getHttpServer()).get(path).expect(401)).body.code).toBe('AUTH_REQUIRED');
  });
  it('protege aussi creation modification suppression et import anonymes', async () => {
    const id = randomUUID();
    await request(app.getHttpServer()).post('/api/projects').send({ name: 'x' }).expect(401);
    await request(app.getHttpServer()).patch(`/api/projects/${id}`).send({ name: 'x' }).expect(401);
    await request(app.getHttpServer()).delete(`/api/projects/${id}`).expect(401);
    await request(app.getHttpServer()).post(`/api/projects/${id}/analyses`).attach('archive', Buffer.from('bad'), 'x.zip').expect(401);
    await request(app.getHttpServer()).get('/health').expect(200);
  });
  it('normalise le profil, hache le mot de passe et stocke seulement le condensat de session', async () => {
    const a = await signup(); const stored = await client.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.name).toBe('Alice'); expect(stored.email).toBe(a.email); expect(stored.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(stored.passwordHash).not.toBe(password); expect(await verifyPassword(password, stored.passwordHash)).toBe(true);
    expect(Object.keys(a.response.body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    const token = a.cookie.split('=')[1]!; expect(await client.session.findUnique({ where: { tokenHash: token } })).toBeNull();
    expect(await client.session.findUnique({ where: { tokenHash: digest(token) } })).toMatchObject({ userId: a.id });
    const header = (a.response.headers['set-cookie'] as unknown as string[])[0]!;
    expect(header).toContain('HttpOnly'); expect(header).toContain('SameSite=Lax'); expect(header).toContain('Path=/'); expect(header).not.toContain('Domain=');
    expect((await a.api.get('/api/auth/me').expect(200)).body.user).toEqual(a.response.body.user);
  });
  it('refuse un doublon email normalise', async () => {
    const a = await signup();
    expect((await request(app.getHttpServer()).post('/api/auth/register').set('X-CodeAudit-Request', '1').send({ name: 'Other', email: a.email.toUpperCase(), password }).expect(409)).body.code).toBe('EMAIL_ALREADY_USED');
    expect(await client.user.count({ where: { email: a.email } })).toBe(1);
  });
  it.each([{ name: '', email: 'a@example.test', password }, { name: 'A', email: 'bad', password }, { name: 'A', email: 'a@example.test', password: 'short' }, { name: 'A', email: 'a@example.test', password: ' '.repeat(12) }, { name: 'A', email: 'a@example.test', password: 'x'.repeat(129) }, { name: 'A', email: 'a@example.test', password, role: 'admin' }])('rejette les champs invalides (%j)', async (input) => {
    await request(app.getHttpServer()).post('/api/auth/register').set('X-CodeAudit-Request', '1').send(input).expect(400);
  });
  it('donne la meme erreur pour un email inconnu et un mot de passe incorrect', async () => {
    const a = await signup();
    const first = await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: a.email, password: 'wrong passphrase 2026!' }).expect(401);
    const second = await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: 'unknown@example.test', password }).expect(401);
    emails.push('unknown@example.test'); expect(first.body.message).toBe(second.body.message); expect(first.body.code).toBe('INVALID_CREDENTIALS');
  });
  it('revoque la session a la deconnexion et refuse sa reutilisation', async () => {
    const a = await signup(); await a.api.post('/api/auth/logout').expect(204);
    await request(app.getHttpServer()).get('/api/projects').set('Cookie', a.cookie).expect(401);
    expect(await client.session.count({ where: { userId: a.id } })).toBe(0);
    const logged = await a.api.post('/api/auth/login').send({ email: a.email, password }).expect(200);
    const replacement = (logged.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!; expect(replacement).not.toBe(a.cookie);
  });
  it.each(['absolute', 'idle'])('expire la session cote serveur (%s)', async (kind) => {
    const a = await signup(); await client.session.updateMany({ where: { userId: a.id }, data: kind === 'absolute' ? { expiresAt: new Date(Date.now() - 1000) } : { lastSeenAt: new Date(Date.now() - 31 * 60000) } });
    const response = await a.api.get('/api/auth/me').expect(401); expect(response.body.code).toBe('SESSION_EXPIRED');
    expect((response.headers['set-cookie'] as unknown as string[])[0]).toContain('Max-Age=0');
    await a.api.post('/api/auth/logout').expect(204);
  });
  it('recharge la session depuis PostgreSQL dans une nouvelle instance API', async () => {
    const a = await signup(); const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); const second = module.createNestApplication(); configureApp(second); await second.init();
    try { expect((await request(second.getHttpServer()).get('/api/auth/me').set('Cookie', a.cookie).expect(200)).body.user.id).toBe(a.id); }
    finally { await second.close(); }
  });
  it('bloque le CSRF et les origines etrangeres avant toute mutation', async () => {
    const a = await signup();
    await request(app.getHttpServer()).post('/api/projects').set('Cookie', a.cookie).send({ name: 'Unsafe' }).expect(403);
    await request(app.getHttpServer()).post('/api/projects').set('Cookie', a.cookie).set('X-CodeAudit-Request', '1').set('X-CSRF-Token', '0'.repeat(64)).send({ name: 'Unsafe' }).expect(403);
    await a.api.post('/api/projects').set('Origin', 'https://evil.example').send({ name: 'Unsafe' }).expect(403);
    await request(app.getHttpServer()).post('/api/auth/login').set('Origin', 'https://evil.example').set('X-CodeAudit-Request', '1').send({ email: a.email, password }).expect(403);
    expect(await client.project.count({ where: { ownerId: a.id } })).toBe(0);
  });
  it('limite les tentatives avec des compteurs persistants et ignore X-Forwarded-For', async () => {
    const email = `limited-${randomUUID()}@example.test`; emails.push(email);
    for (let index = 0; index < 10; index++) await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').set('X-Forwarded-For', `10.0.0.${index}`).send({ email, password }).expect(401);
    expect((await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email, password }).expect(429)).body.code).toBe('AUTH_RATE_LIMIT');
    expect((await client.authThrottle.findUniqueOrThrow({ where: { keyHash: throttleKey('login', 'email', email) } })).count).toBe(10);
  });
  it('isole tous les projets analyses historiques rapports et indicateurs entre deux comptes', async () => {
    const a = await signup(); const b = await signup();
    const project = (await a.api.post('/api/projects').send({ name: 'A private' }).expect(201)).body as { id: string };
    await b.api.post('/api/projects').send({ name: 'Forged', ownerId: a.id }).expect(400);
    const queued = (await a.api.post(`/api/projects/${project.id}/analyses`).attach('archive', zip([{ name: 'index.js', data: 'debugger;' }]), 'project.zip').expect(202)).body as { id: string };
    await processNext(new AnalysisQueue(client), await SourceStore.open(root), 'auth-test');
    expect((await a.api.get(`/api/analyses/${queued.id}/report`).expect(200)).body.project).not.toHaveProperty('ownerId');
    for (const path of [`/api/projects/${project.id}`, `/api/projects/${project.id}/analyses`, `/api/analyses/${queued.id}`, `/api/analyses/${queued.id}/results`, `/api/analyses/${queued.id}/report`]) await b.api.get(path).expect(404);
    await b.api.patch(`/api/projects/${project.id}`).send({ name: 'Stolen' }).expect(404); await b.api.delete(`/api/projects/${project.id}`).expect(404);
    await b.api.post(`/api/projects/${project.id}/analyses`).attach('archive', zip([{ name: 'b.js', data: 'debugger;' }]), 'b.zip').expect(404);
    await b.api.patch(`/api/analyses/${queued.id}`).send({ status: 'FAILED' }).expect(404); await b.api.delete(`/api/analyses/${queued.id}`).expect(404);
    expect((await b.api.get('/api/projects').expect(200)).body).toEqual([]);
    expect((await b.api.get('/api/dashboard').expect(200)).body).toMatchObject({ projectCount: 0, analysisCount: 0, latestAnalyses: [] });
    expect((await a.api.get('/api/dashboard').expect(200)).body).toMatchObject({ projectCount: 1, analysisCount: 1 });
    expect((await client.project.findUniqueOrThrow({ where: { id: project.id } })).name).toBe('A private');
    expect(await client.analysis.count({ where: { projectId: project.id } })).toBe(1);
  });
  it('conserve les projets historiques sans les donner au premier inscrit', async () => {
    const old = await client.project.create({ data: { name: 'Legacy unassigned' } }); legacy.push(old.id); const a = await signup();
    await a.api.get(`/api/projects/${old.id}`).expect(404); await a.api.patch(`/api/projects/${old.id}`).send({ name: 'Claimed' }).expect(404); await a.api.delete(`/api/projects/${old.id}`).expect(404);
    expect((await a.api.get('/api/projects').expect(200)).body).toEqual([]); expect((await client.project.findUniqueOrThrow({ where: { id: old.id } })).ownerId).toBeNull();
  });
  it('impose Secure et le prefixe __Host en production', async () => {
    const oldEnv = process.env.NODE_ENV; const oldOrigin = process.env.AUTH_APP_ORIGIN;
    process.env.NODE_ENV = 'production'; process.env.AUTH_APP_ORIGIN = 'https://app.example.test';
    try { const a = await signup(); const header = (a.response.headers['set-cookie'] as unknown as string[])[0]!; expect(header).toMatch(/^__Host-codeaudit.sid=/); expect(header).toContain('Secure'); expect(header).toContain('HttpOnly'); expect(header).not.toContain('Domain='); }
    finally { process.env.NODE_ENV = oldEnv; if (oldOrigin === undefined) delete process.env.AUTH_APP_ORIGIN; else process.env.AUTH_APP_ORIGIN = oldOrigin; }
  });
});
