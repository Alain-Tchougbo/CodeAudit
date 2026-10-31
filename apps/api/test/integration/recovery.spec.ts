import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import type { ActiveSession } from '@codeaudit/contracts';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { digest } from '../../src/auth/auth.service';
import { verifyPassword } from '../../src/auth/password';
import { signedIn, clearTestThrottle } from './auth-helper';
import { resetLink, testMessages } from '../../../../tests/mailpit';
jest.setTimeout(60000);
const password = 'Integration password 2026!'; const replacement = 'A replacement passphrase 2026!';
describe('Récupération et sessions — PostgreSQL et SMTP réels', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Awaited<ReturnType<typeof signedIn>>; let other: Awaited<ReturnType<typeof signedIn>>;
  const emails: string[] = []; const oldUrl = process.env.DATABASE_URL; const oldHost = process.env.SMTP_HOST; const oldPort = process.env.SMTP_PORT; const oldOrigin = process.env.AUTH_APP_ORIGIN;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1026'; process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
  });
  beforeEach(async () => { owner = await signedIn(app); other = await signedIn(app); emails.push(owner.email, other.email); });
  afterEach(async () => { await client.user.deleteMany({ where: { id: { in: [owner.userId, other.userId] } } }); await clearTestThrottle(client, emails.splice(0)); });
  afterAll(async () => { if (app) await app.close(); if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl; if (oldHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = oldHost; if (oldPort === undefined) delete process.env.SMTP_PORT; else process.env.SMTP_PORT = oldPort; if (oldOrigin === undefined) delete process.env.AUTH_APP_ORIGIN; else process.env.AUTH_APP_ORIGIN = oldOrigin; });
  async function device() {
    const response = await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: owner.email, password }).expect(200);
    return (response.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  }
  async function issue() {
    await request(app.getHttpServer()).post('/api/auth/forgot-password').set('X-CodeAudit-Request', '1').set('Host', 'evil.example').send({ email: ` ${owner.email.toUpperCase()} ` }).expect(202);
    const url = new URL(await resetLink(owner.email)); expect(url.hostname).toBe('127.0.0.1'); return new URLSearchParams(url.hash.slice(1)).get('token')!;
  }
  const reset = (token: string, value = replacement) => request(app.getHttpServer()).post('/api/auth/reset-password').set('X-CodeAudit-Request', '1').send({ token, password: value });
  it('liste seulement les sessions du compte sans exposer leurs condensats', async () => {
    await device(); const response = await owner.api.get('/api/auth/sessions').expect(200); const sessions = response.body as ActiveSession[];
    expect(sessions).toHaveLength(2); expect(sessions.filter(session => session.current)).toHaveLength(1); expect(sessions.every(session => /^[a-f0-9-]{36}$/.test(session.id))).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('tokenHash'); expect((await other.api.get('/api/auth/sessions').expect(200)).body).toHaveLength(1);
    await request(app.getHttpServer()).get('/api/auth/sessions').expect(401);
  });
  it('révoque une autre session sans fermer la session courante et refuse un autre compte', async () => {
    const cookie = await device(); const sessions = (await owner.api.get('/api/auth/sessions').expect(200)).body as ActiveSession[];
    const target = sessions.find(session => !session.current)!;
    await other.api.delete(`/api/auth/sessions/${target.id}`).expect(404);
    await owner.api.delete(`/api/auth/sessions/${target.id}`).set('X-CSRF-Token', '').expect(403);
    await owner.api.delete(`/api/auth/sessions/${target.id}`).expect(204);
    await request(app.getHttpServer()).get('/api/projects').set('Cookie', cookie).expect(401); await owner.api.get('/api/auth/me').expect(200);
  });
  it('ferme toutes les sessions du seul compte connecté', async () => {
    const cookie = await device(); await owner.api.post('/api/auth/logout-all').expect(204);
    await request(app.getHttpServer()).get('/api/projects').set('Cookie', cookie).expect(401); await owner.api.get('/api/auth/me').expect(401); await other.api.get('/api/auth/me').expect(200);
  });
  it('envoie un vrai message SMTP, stocke seulement un condensat et répond génériquement', async () => {
    const unknown = `unknown-${randomUUID()}@example.test`; emails.push(unknown);
    const a = await owner.api.post('/api/auth/forgot-password').send({ email: owner.email }).expect(202);
    const b = await owner.api.post('/api/auth/forgot-password').send({ email: unknown }).expect(202); expect(a.body).toEqual(b.body); expect(await testMessages(unknown)).toEqual([]);
    const url = new URL(await resetLink(owner.email)); const token = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect((await client.passwordResetToken.findUniqueOrThrow({ where: { userId: owner.userId } })).tokenHash).toBe(digest(token)); expect(JSON.stringify(a.body)).not.toContain(token);
  });
  it('change le mot de passe, invalide le lien et révoque les anciennes sessions', async () => {
    const cookie = await device(); const token = await issue(); await reset(token).expect(204); await reset(token).expect(400);
    expect(await client.session.count({ where: { userId: owner.userId } })).toBe(0); expect(await verifyPassword(replacement, (await client.user.findUniqueOrThrow({ where: { id: owner.userId } })).passwordHash)).toBe(true);
    await request(app.getHttpServer()).get('/api/projects').set('Cookie', cookie).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: owner.email, password }).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: owner.email, password: replacement }).expect(200);
    await other.api.get('/api/auth/me').expect(200);
  });
  it('refuse les liens expirés, les entrées invalides et les origines étrangères', async () => {
    const token = await issue();
    await reset(token, 'short').expect(400); expect(await client.passwordResetToken.count({ where: { userId: owner.userId } })).toBe(1);
    await client.passwordResetToken.update({ where: { userId: owner.userId }, data: { expiresAt: new Date(0) } }); await reset(token).expect(400);
    await request(app.getHttpServer()).post('/api/auth/forgot-password').set('X-CodeAudit-Request', '1').set('Origin', 'https://evil.example').send({ email: owner.email }).expect(403);
    await request(app.getHttpServer()).post('/api/auth/reset-password').send({ token, password: replacement }).expect(403);
    await owner.api.post('/api/auth/forgot-password').send({ email: 'invalid', extra: true }).expect(400);
  });
  it('ne permet qu’une consommation parmi deux changements simultanés', async () => {
    const token = await issue(); const responses = await Promise.all([reset(token), reset(token, 'Another replacement passphrase!')]);
    expect(responses.map(response => response.status).sort()).toEqual([204, 400]); expect(await client.passwordResetToken.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('limite aussi les demandes pour une adresse inconnue', async () => {
    const email = `limited-reset-${randomUUID()}@example.test`; emails.push(email);
    for (let index = 0; index < 3; index++) await owner.api.post('/api/auth/forgot-password').send({ email }).expect(202);
    expect((await owner.api.post('/api/auth/forgot-password').send({ email }).expect(429)).body.code).toBe('AUTH_RATE_LIMIT');
  });
});
