import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@codeaudit/database';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { AuthService, digest, throttleKey } from '../../src/auth/auth.service';
import { MailService } from '../../src/auth/mail.service';
import { OAuthService } from '../../src/auth/oauth.service';
import { totp } from '../../src/auth/security-crypto';
import { signedIn, clearTestThrottle } from './auth-helper';
import { mailLink } from '../../../../tests/mailpit';
jest.setTimeout(60000);
const password = 'Integration password 2026!'; const replacement = 'A replacement passphrase 2026!';
type Account = Awaited<ReturnType<typeof signedIn>>;
describe('Comptes et sécurité — PostgreSQL et SMTP réels', () => {
  let app: INestApplication; let client: PrismaClient; let owner: Account; let other: Account; const ids: string[] = []; const emails: string[] = [];
  const env = Object.fromEntries(['DATABASE_URL', 'SMTP_HOST', 'SMTP_PORT', 'AUTH_APP_ORIGIN', 'SECURITY_ENCRYPTION_KEY', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET'].map(key => [key, process.env[key]]));
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1026'; process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173'; process.env.SECURITY_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    for (const provider of ['GITHUB', 'GITLAB']) { process.env[`${provider}_CLIENT_ID`] = 'controlled-test-client'; process.env[`${provider}_CLIENT_SECRET`] = 'controlled-test-secret'; }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
  });
  beforeEach(async () => { await clearTestThrottle(client); owner = await account(); other = await account(); });
  afterEach(async () => {
    jest.restoreAllMocks(); await client.project.deleteMany({ where: { OR: [{ ownerId: { in: ids } }, { team: { OR: [{ createdById: { in: ids } }, { members: { some: { userId: { in: ids } } } }] } }] } });
    await client.team.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { members: { some: { userId: { in: ids } } } }] } });
    await client.user.deleteMany({ where: { id: { in: ids } } });
    const extra = ['verify', 'reauth', 'oauth'].flatMap(operation => [throttleKey(operation, 'ip', '127.0.0.1'), ...ids.map(id => throttleKey(operation, 'email', id))]); await client.authThrottle.deleteMany({ where: { keyHash: { in: extra } } }); await clearTestThrottle(client, emails); ids.length = 0; emails.length = 0;
  });
  afterAll(async () => { if (app) await app.close(); for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  async function account() { const value = await signedIn(app); ids.push(value.userId); emails.push(value.email); return value; }
  async function verified(value = owner) { await value.api.post('/api/auth/verification-request').expect(202); const token = new URLSearchParams(new URL(await mailLink(value.email, 'verify-email')).hash.slice(1)).get('token')!; await value.api.post('/api/auth/verify-email').send({ token }).expect(200); return token; }
  async function enable(value = owner) {
    await verified(value); const setup = await value.api.post('/api/auth/mfa/setup').send({ currentPassword: password }).expect(200); const secret = setup.body.secret as string;
    const result = await value.api.post('/api/auth/mfa/enable').send({ code: totp(secret, Math.floor(Date.now() / 30000)) }).expect(200);
    value.api.set('X-CSRF-Token', result.body.profile.csrfToken as string); return { secret, recoveryCodes: result.body.recoveryCodes as string[] };
  }
  const login = (value = owner, code?: string, secret = password) => request(app.getHttpServer()).post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: value.email, password: secret, ...(code ? { code } : {}) });
  it('protège les routes, le CSRF et les champs inconnus', async () => {
    await request(app.getHttpServer()).get('/api/auth/security').expect(401); await owner.api.patch('/api/auth/profile').set('X-CSRF-Token', '').send({ name: 'Changed' }).expect(403);
    await owner.api.patch('/api/auth/profile').send({ name: 'Changed', userId: other.userId }).expect(400); await owner.api.get(`/api/auth/security-events?userId=${other.userId}`).expect(400); await owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'no' }).expect(400);
  });
  it('modifie le nom uniquement pour le compte connecté sans exposer les champs internes', async () => {
    const result = await owner.api.patch('/api/auth/profile').send({ name: ' Updated ' }).expect(200); expect(result.body.user.name).toBe('Updated'); expect(Object.keys(result.body.user).sort()).toEqual(['createdAt', 'email', 'id', 'name']); expect((await other.api.get('/api/auth/me').expect(200)).body.user.name).toBe('Integration User');
  });
  it('envoie un vrai lien, stocke son SHA-256 et confirme une seule fois', async () => {
    expect((await owner.api.get('/api/auth/security').expect(200)).body.emailVerifiedAt).toBeNull(); await owner.api.post('/api/auth/verification-request').expect(202);
    const token = new URLSearchParams(new URL(await mailLink(owner.email, 'verify-email')).hash.slice(1)).get('token')!; expect((await client.emailVerification.findUniqueOrThrow({ where: { userId: owner.userId } })).tokenHash).toBe(digest(token));
    await owner.api.post('/api/auth/verify-email').send({ token }).expect(200); await owner.api.post('/api/auth/verify-email').send({ token }).expect(400); expect((await owner.api.get('/api/auth/security').expect(200)).body.emailVerifiedAt).not.toBeNull(); expect((await other.api.get('/api/auth/security').expect(200)).body.emailVerifiedAt).toBeNull();
  });
  it('rejette un lien expiré et un ancien lien remplacé', async () => {
    await owner.api.post('/api/auth/verification-request').expect(202); const old = await client.emailVerification.findUniqueOrThrow({ where: { userId: owner.userId } }); await owner.api.post('/api/auth/verification-request').expect(202); expect((await client.emailVerification.findUniqueOrThrow({ where: { userId: owner.userId } })).tokenHash).not.toBe(old.tokenHash);
    const token = new URLSearchParams(new URL(await mailLink(owner.email, 'verify-email')).hash.slice(1)).get('token')!; await client.emailVerification.update({ where: { userId: owner.userId }, data: { createdAt: new Date(Date.now() - 3600000), expiresAt: new Date(Date.now() - 1000) } }); await owner.api.post('/api/auth/verify-email').send({ token }).expect(400);
  });
  it('n’annonce pas un envoi si SMTP échoue', async () => {
    jest.spyOn(app.get(MailService), 'verify').mockRejectedValue(new Error('controlled SMTP failure')); await owner.api.post('/api/auth/verification-request').expect(503); expect(await client.emailVerification.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('consomme la confirmation e-mail une seule fois malgré deux requêtes concurrentes', async () => {
    await owner.api.post('/api/auth/verification-request').expect(202); const token = new URLSearchParams(new URL(await mailLink(owner.email, 'verify-email')).hash.slice(1)).get('token')!;
    const results = await Promise.all([owner.api.post('/api/auth/verify-email').send({ token }), owner.api.post('/api/auth/verify-email').send({ token })]); expect(results.filter(value => value.status === 200)).toHaveLength(1); expect([400, 409]).toContain(results.find(value => value.status !== 200)!.status); expect(await client.securityEvent.count({ where: { userId: owner.userId, type: 'EMAIL_VERIFIED' } })).toBe(1);
  });
  it('ne change l’adresse qu’après preuve e-mail puis révoque sessions et clés', async () => {
    const email = `changed-${randomUUID()}@example.test`; emails.push(email); await owner.api.post('/api/auth/change-email').send({ email: other.email, currentPassword: password }).expect(409);
    await owner.api.post('/api/auth/change-email').send({ email, currentPassword: 'A wrong password 2026!' }).expect(403);
    const project = await client.project.create({ data: { name: 'Personal', ownerId: owner.userId } }); await owner.api.post(`/api/projects/${project.id}/api-keys`).send({ name: 'key', expiresInDays: 1 }).expect(201);
    await owner.api.post('/api/auth/change-email').send({ email, currentPassword: password }).expect(202); expect((await client.user.findUniqueOrThrow({ where: { id: owner.userId } })).email).toBe(owner.email);
    const token = new URLSearchParams(new URL(await mailLink(email, 'verify-email')).hash.slice(1)).get('token')!; await owner.api.post('/api/auth/verify-email').send({ token }).expect(200);
    expect((await client.user.findUniqueOrThrow({ where: { id: owner.userId } })).email).toBe(email); expect(await client.session.count({ where: { userId: owner.userId } })).toBe(0); expect(await client.apiKey.count({ where: { userId: owner.userId } })).toBe(0); await owner.api.get('/api/auth/me').expect(401); await other.api.get('/api/auth/me').expect(200);
  });
  it('change le mot de passe, refuse l’ancien et ferme toutes les sessions du compte', async () => {
    await owner.api.post('/api/auth/change-password').send({ currentPassword: password, password: replacement }).expect(204); await owner.api.get('/api/auth/me').expect(401); await login().expect(401); await login(owner, undefined, replacement).expect(200); await other.api.get('/api/auth/me').expect(200);
  });
  it('invalide les confirmations de changement d’adresse après rotation du mot de passe', async () => {
    const email = `invalidated-${randomUUID()}@example.test`; emails.push(email); await owner.api.post('/api/auth/change-email').send({ email, currentPassword: password }).expect(202); const token = new URLSearchParams(new URL(await mailLink(email, 'verify-email')).hash.slice(1)).get('token')!;
    await owner.api.post('/api/auth/change-password').send({ currentPassword: password, password: replacement }).expect(204); await request(app.getHttpServer()).post('/api/auth/verify-email').set('X-CodeAudit-Request', '1').send({ token }).expect(400); expect((await client.user.findUniqueOrThrow({ where: { id: owner.userId } })).email).toBe(owner.email);
  });
  it('ne donne aucune capacité de gestion du compte aux clés CI', async () => {
    const project = await client.project.create({ data: { name: 'Scoped CI account test', ownerId: owner.userId } }); const key = (await owner.api.post(`/api/projects/${project.id}/api-keys`).send({ name: 'Scoped', expiresInDays: 1 }).expect(201)).body.token as string;
    for (const path of ['/api/auth/security', '/api/auth/security-events']) await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${key}`).expect(401);
    await request(app.getHttpServer()).delete('/api/auth/account').set('Authorization', `Bearer ${key}`).send({ currentPassword: password, confirmation: 'SUPPRIMER' }).expect(401);
  });
  it('refuse une émission de session fondée sur une ancienne version des accès', async () => {
    const old = await client.user.findUniqueOrThrow({ where: { id: owner.userId } }); await owner.api.post('/api/auth/logout-all').expect(204);
    const response = { cookie: jest.fn(), setHeader: jest.fn() }; await expect(app.get(AuthService).issue(owner.userId, { method: 'POST', headers: {}, socket: {} }, response, old.authVersion)).rejects.toThrow(); expect(response.cookie).not.toHaveBeenCalled();
  });
  it('rejette une session obsolète même si sa ligne existe encore en base', async () => {
    await client.user.update({ where: { id: owner.userId }, data: { authVersion: { increment: 1 } } }); expect(await client.session.count({ where: { userId: owner.userId } })).toBe(1); await owner.api.get('/api/auth/me').expect(401); expect(await client.session.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('refuse MFA et association OAuth avant la vérification e-mail', async () => {
    await owner.api.post('/api/auth/mfa/setup').send({ currentPassword: password }).expect(403); await owner.api.post('/api/auth/oauth/GITHUB/link').send({ currentPassword: password }).expect(403);
  });
  it('active la 2FA avec secret chiffré, codes de secours hachés et aucune session avant le second facteur', async () => {
    const { secret, recoveryCodes } = await enable(); const stored = await client.mfaCredential.findUniqueOrThrow({ where: { userId: owner.userId } }); expect(stored.secretEncrypted).not.toContain(secret); expect(recoveryCodes).toHaveLength(10);
    const hashes = await client.mfaRecoveryCode.findMany({ where: { userId: owner.userId } }); expect(JSON.stringify(hashes)).not.toContain(recoveryCodes[0]); expect(JSON.stringify((await owner.api.get('/api/auth/security').expect(200)).body)).not.toContain(secret);
    const count = await client.session.count({ where: { userId: owner.userId } }); expect((await login().expect(401)).body.code).toBe('MFA_REQUIRED'); expect(await client.session.count({ where: { userId: owner.userId } })).toBe(count);
    await login(owner, recoveryCodes[0]).expect(200); await login(owner, recoveryCodes[0]).expect(401); expect(await client.mfaRecoveryCode.count({ where: { userId: owner.userId } })).toBe(9);
  });
  it('consomme un seul code TOTP malgré deux connexions concurrentes et refuse le rejeu', async () => {
    const { secret } = await enable(); await client.mfaCredential.update({ where: { userId: owner.userId }, data: { lastUsedStep: BigInt(-1) } }); const code = totp(secret, Math.floor(Date.now() / 30000));
    const responses = await Promise.all([login(owner, code), login(owner, code)]); expect(responses.map(value => value.status).sort()).toEqual([200, 401]); await login(owner, code).expect(401);
  });
  it('consomme un seul code de secours malgré deux connexions concurrentes', async () => {
    const { recoveryCodes } = await enable(); const responses = await Promise.all([login(owner, recoveryCodes[0]), login(owner, recoveryCodes[0])]); expect(responses.map(value => value.status).sort()).toEqual([200, 401]);
  });
  it('refuse une configuration 2FA expirée sans activer le second facteur', async () => {
    await verified(); const setup = await owner.api.post('/api/auth/mfa/setup').send({ currentPassword: password }).expect(200); await client.mfaCredential.update({ where: { userId: owner.userId }, data: { pendingExpiresAt: new Date(Date.now() - 1000) } });
    await owner.api.post('/api/auth/mfa/enable').send({ code: totp(setup.body.secret as string, Math.floor(Date.now() / 30000)) }).expect(409); expect((await owner.api.get('/api/auth/security').expect(200)).body.mfa.enabled).toBe(false);
  });
  it('invalide un enrôlement 2FA non confirmé lors d’une rotation du mot de passe', async () => {
    await verified(); const setup = await owner.api.post('/api/auth/mfa/setup').send({ currentPassword: password }).expect(200); await owner.api.post('/api/auth/change-password').send({ currentPassword: password, password: replacement }).expect(204);
    const signed = await owner.api.post('/api/auth/login').send({ email: owner.email, password: replacement }).expect(200); owner.api.set('X-CSRF-Token', signed.body.csrfToken as string); await owner.api.post('/api/auth/mfa/enable').send({ code: totp(setup.body.secret as string, Math.floor(Date.now() / 30000)) }).expect(409); expect((await owner.api.get('/api/auth/security').expect(200)).body.mfa.enabled).toBe(false);
  });
  it('exige le second facteur pour les actions sensibles et révoque après désactivation', async () => {
    const { recoveryCodes } = await enable(); await owner.api.post('/api/auth/change-password').send({ currentPassword: password, password: replacement }).expect(403);
    await owner.api.post('/api/auth/mfa/disable').send({ currentPassword: password, code: recoveryCodes[0] }).expect(204); await owner.api.get('/api/auth/me').expect(401); await login().expect(200); expect(await client.mfaCredential.count({ where: { userId: owner.userId } })).toBe(0); expect(await client.mfaRecoveryCode.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('ne désactive pas la 2FA par une réinitialisation e-mail et révoque les identités externes', async () => {
    await enable(); await client.oAuthIdentity.create({ data: { userId: owner.userId, provider: 'GITHUB', subject: '123456', login: 'controlled' } });
    const token = randomBytes(32).toString('hex'); await client.passwordResetToken.create({ data: { userId: owner.userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60000) } });
    await owner.api.post('/api/auth/reset-password').send({ token, password: replacement }).expect(204); expect((await login(owner, undefined, replacement).expect(401)).body.code).toBe('MFA_REQUIRED'); expect(await client.oAuthIdentity.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('exporte uniquement les données autorisées sans secrets ni rapports partagés', async () => {
    await owner.api.patch('/api/auth/profile').send({ name: 'Export owner' }).expect(200); const foreign = await client.project.create({ data: { ownerId: other.userId, name: 'Foreign secret' } });
    await client.project.create({ data: { ownerId: owner.userId, name: 'My personal project' } });
    const exported = await owner.api.post('/api/auth/data-export').send({ currentPassword: password }).expect(200); expect(exported.headers['content-disposition']).toContain('codeaudit-account-v1.json'); expect(exported.body).toMatchObject({ schemaVersion: 1, user: { id: owner.userId, name: 'Export owner' } });
    const text = JSON.stringify(exported.body); for (const secret of ['passwordHash', 'tokenHash', 'secretEncrypted', 'codeHash', foreign.id, other.email]) expect(text).not.toContain(secret);
    expect(exported.body.projects.map((value: { name: string }) => value.name)).toEqual(['My personal project']); expect(exported.body.sessions[0].id).toBeDefined();
  });
  it('conserve les événements réels, les isole et refuse le curseur d’un autre compte', async () => {
    await owner.api.patch('/api/auth/profile').send({ name: 'Audited' }).expect(200); const mine = (await owner.api.get('/api/auth/security-events').expect(200)).body;
    expect(mine.items.some((value: { type: string }) => value.type === 'PROFILE_UPDATED')).toBe(true); expect(JSON.stringify(mine)).not.toContain(owner.email); await other.api.get(`/api/auth/security-events?cursor=${mine.items[0].id}`).expect(400);
    await client.securityEvent.create({ data: { userId: owner.userId, type: 'LOGIN_FAILED', createdAt: new Date(Date.now() - 91 * 86400000) } }); await owner.api.get('/api/auth/security-events').expect(200); expect(await client.securityEvent.count({ where: { userId: owner.userId, type: 'LOGIN_FAILED' } })).toBe(0);
  });
  it('pagine tous les événements conservés sans doublon et ne tronque pas un export trop grand', async () => {
    await client.securityEvent.createMany({ data: Array.from({ length: 25 }, (_unused, index) => ({ userId: owner.userId, type: 'LOGIN_FAILED', createdAt: new Date(Date.now() - index * 1000) })) }); const first = (await owner.api.get('/api/auth/security-events').expect(200)).body; expect(first.items).toHaveLength(20); const next = (await owner.api.get(`/api/auth/security-events?cursor=${first.nextCursor}`).expect(200)).body; expect(next.nextCursor).toBeNull(); expect(new Set([...first.items, ...next.items].map((value: { id: string }) => value.id)).size).toBe(26);
    await client.project.createMany({ data: Array.from({ length: 501 }, (_unused, index) => ({ name: `Export bound ${index}`, ownerId: owner.userId })) }); const response = await owner.api.post('/api/auth/data-export').send({ currentPassword: password }).expect(413); expect(response.headers['content-disposition']).toBeUndefined();
  });
  it('supprime le compte personnel et ses secrets sans affecter les autres comptes', async () => {
    await client.project.create({ data: { ownerId: owner.userId, name: 'Deleted with account', analyses: { create: { status: 'FAILED' } } } });
    await owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' }).expect(204); expect(await client.user.findUnique({ where: { id: owner.userId } })).toBeNull(); expect(await client.project.count({ where: { ownerId: owner.userId } })).toBe(0); await other.api.get('/api/auth/me').expect(200); await owner.api.get('/api/auth/me').expect(401);
  });
  it('refuse la suppression d’un compte ayant une analyse personnelle active', async () => {
    await client.project.create({ data: { ownerId: owner.userId, name: 'Queued project', analyses: { create: {} } } }); expect((await owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' }).expect(409)).body.code).toBe('ACCOUNT_BUSY');
  });
  it('protège le dernier administrateur puis préserve les projets partagés après suppression', async () => {
    const team = await client.team.create({ data: { name: 'Retained', createdById: owner.userId, members: { create: [{ userId: owner.userId, role: 'ADMIN' }, { userId: other.userId, role: 'MEMBER' }] } } });
    const project = await client.project.create({ data: { ownerId: owner.userId, teamId: team.id, name: 'Retained shared project', analyses: { create: { status: 'FAILED' } } } });
    expect((await owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' }).expect(409)).body.code).toBe('LAST_TEAM_ADMIN');
    await client.teamMember.update({ where: { teamId_userId: { teamId: team.id, userId: other.userId } }, data: { role: 'ADMIN' } }); await owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' }).expect(204);
    expect((await client.project.findUniqueOrThrow({ where: { id: project.id } })).ownerId).toBeNull(); expect((await client.team.findUniqueOrThrow({ where: { id: team.id } })).createdById).toBeNull(); await other.api.get(`/api/projects/${project.id}`).expect(200);
    await client.project.delete({ where: { id: project.id } });
  });
  it('deux suppressions concurrentes ne laissent pas une équipe partagée sans administrateur', async () => {
    const team = await client.team.create({ data: { name: 'Race team', createdById: owner.userId, members: { create: [{ userId: owner.userId, role: 'ADMIN' }, { userId: other.userId, role: 'ADMIN' }] } } });
    const project = await client.project.create({ data: { ownerId: null, teamId: team.id, name: 'Retained race' } });
    let release!: () => void; let locked!: () => void; const gate = new Promise<void>(resolveGate => { release = resolveGate; }); const ready = new Promise<void>(resolveReady => { locked = resolveReady; });
    const barrier = client.$transaction(async transaction => { await transaction.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id IN (${owner.userId}::uuid,${other.userId}::uuid) FOR UPDATE`); locked(); await gate; }, { timeout: 15000 });
    await ready;
    const requests = [owner.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' }), other.api.delete('/api/auth/account').send({ currentPassword: password, confirmation: 'SUPPRIMER' })].map(value => value.then(response => response));
    try {
      const deadline = Date.now() + 5000; let waiting = 0;
      while (waiting < 2 && Date.now() < deadline) { const [row] = await client.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%DELETE FROM%User%'`); waiting = row?.count ?? 0; if (waiting < 2) await new Promise(resolveDelay => setTimeout(resolveDelay, 25)); }
      expect(waiting).toBe(2);
    } finally { release(); await barrier; }
    const responses = await Promise.all(requests); expect(responses.map(value => value.status).sort()).toEqual([204, 409]); expect(await client.teamMember.count({ where: { teamId: team.id, role: 'ADMIN' } })).toBe(1); await client.project.delete({ where: { id: project.id } });
  });
  async function external(provider: 'GITHUB' | 'GITLAB', subject = '123456') {
    await verified(); const identity = jest.spyOn(app.get(OAuthService), 'identity').mockResolvedValue({ subject, login: `controlled-${provider}` });
    const response = await owner.api.post(`/api/auth/oauth/${provider}/link`).send({ currentPassword: password }).expect(200); const url = new URL(response.body.url as string); expect(url.searchParams.get('code_challenge_method')).toBe('S256'); const state = url.searchParams.get('state')!;
    const flow = await client.oAuthFlow.findUniqueOrThrow({ where: { tokenHash: digest(state) } }); expect(flow.verifierEncrypted).not.toContain(state);
    await owner.api.get(`/api/auth/oauth/${provider}/callback?state=${state}&code=controlled-code`).expect(302); expect(identity).toHaveBeenCalledWith(provider, 'controlled-code', expect.any(String)); return { state, identity };
  }
  it.each(['GITHUB', 'GITLAB'] as const)('associe explicitement %s puis ouvre une vraie session après le callback contrôlé', async provider => {
    const { state } = await external(provider); expect(await client.oAuthIdentity.count({ where: { userId: owner.userId, provider } })).toBe(1);
    const browser = request.agent(app.getHttpServer()); const start = await browser.get(`/api/auth/oauth/${provider}/start`).expect(302); const loginState = new URL(start.headers.location!).searchParams.get('state')!;
    const result = await browser.get(`/api/auth/oauth/${provider}/callback?state=${loginState}&code=controlled-code`).expect(302); expect(result.headers.location).toBe('http://127.0.0.1:5173/'); expect((await browser.get('/api/auth/me').expect(200)).body.user.id).toBe(owner.userId);
    const replay = await owner.api.get(`/api/auth/oauth/${provider}/callback?state=${state}&code=controlled-code`).expect(302); expect(replay.headers.location).toContain('oauthError');
  });
  it('refuse le callback dans un autre navigateur et ne lie jamais par correspondance d’e-mail', async () => {
    await verified(); jest.spyOn(app.get(OAuthService), 'identity').mockResolvedValue({ subject: '999999', login: 'unlinked' });
    // A public provider is not a global account identifier: one caller must not exhaust it for everyone.
    await client.authThrottle.upsert({ where: { keyHash: throttleKey('oauth', 'email', 'GITHUB') }, create: { keyHash: throttleKey('oauth', 'email', 'GITHUB'), count: 10, windowStart: new Date() }, update: { count: 10, windowStart: new Date() } });
    const browser = request.agent(app.getHttpServer()); const start = await browser.get('/api/auth/oauth/GITHUB/start').expect(302); const state = new URL(start.headers.location!).searchParams.get('state')!;
    const wrong = await request(app.getHttpServer()).get(`/api/auth/oauth/GITHUB/callback?state=${state}&code=controlled-code`).expect(302); expect(wrong.headers.location).toContain('oauthError'); expect(await client.oAuthFlow.count({ where: { tokenHash: digest(state) } })).toBe(1);
    const result = await browser.get(`/api/auth/oauth/GITHUB/callback?state=${state}&code=controlled-code`).expect(302); expect(result.headers.location).toContain('oauthError'); await browser.get('/api/auth/me').expect(401); expect(await client.oAuthIdentity.count()).toBe(0);
  });
  it('refuse une expiration, un changement de fournisseur et une annulation externe', async () => {
    const identity = jest.spyOn(app.get(OAuthService), 'identity'); const browser = request.agent(app.getHttpServer()); const start = await browser.get('/api/auth/oauth/GITHUB/start').expect(302); const state = new URL(start.headers.location!).searchParams.get('state')!;
    const swapped = await browser.get(`/api/auth/oauth/GITLAB/callback?state=${state}&code=controlled`).expect(302); expect(swapped.headers.location).toContain('oauthError'); expect(identity).not.toHaveBeenCalled(); await client.oAuthFlow.update({ where: { tokenHash: digest(state) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await browser.get(`/api/auth/oauth/GITHUB/callback?state=${state}&code=controlled`).expect(302); expect(identity).not.toHaveBeenCalled(); const second = await browser.get('/api/auth/oauth/GITHUB/start').expect(302); const nextState = new URL(second.headers.location!).searchParams.get('state')!; const denied = await browser.get(`/api/auth/oauth/GITHUB/callback?state=${nextState}&error=access_denied&error_uri=https%3A%2F%2Fevil.example`).expect(302); expect(denied.headers.location).toBe('http://127.0.0.1:5173/login?oauthError=failed'); expect(identity).not.toHaveBeenCalled();
  });
  it('exige la 2FA après OAuth et dissocie uniquement le fournisseur du compte connecté', async () => {
    const { recoveryCodes } = await enable(); await client.oAuthIdentity.create({ data: { userId: owner.userId, provider: 'GITHUB', subject: '88888', login: 'controlled' } }); jest.spyOn(app.get(OAuthService), 'identity').mockResolvedValue({ subject: '88888', login: 'controlled' });
    const browser = request.agent(app.getHttpServer()); const start = await browser.get('/api/auth/oauth/GITHUB/start').expect(302); const state = new URL(start.headers.location!).searchParams.get('state')!;
    const result = await browser.get(`/api/auth/oauth/GITHUB/callback?state=${state}&code=controlled`).expect(302); expect(result.headers.location).toContain('oauth=mfa'); await browser.get('/api/auth/me').expect(401);
    const profile = await browser.post('/api/auth/oauth/mfa').set('X-CodeAudit-Request', '1').send({ code: recoveryCodes[0] }).expect(200); expect(profile.body.user.id).toBe(owner.userId); await browser.post('/api/auth/oauth/mfa').set('X-CodeAudit-Request', '1').send({ code: recoveryCodes[1] }).expect(409);
    await other.api.delete('/api/auth/oauth/GITHUB/link').send({ currentPassword: password }).expect(400); expect(await client.oAuthIdentity.count({ where: { userId: owner.userId } })).toBe(1);
    await owner.api.delete('/api/auth/oauth/GITHUB/link').send({ currentPassword: password, code: recoveryCodes[2] }).expect(204); expect(await client.oAuthIdentity.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('refuse une identité déjà associée à un autre compte', async () => {
    await client.oAuthIdentity.create({ data: { userId: other.userId, provider: 'GITHUB', subject: '123456', login: 'existing' } }); await external('GITHUB'); expect(await client.oAuthIdentity.count({ where: { userId: owner.userId } })).toBe(0);
  });
  it('ne remplace pas une session d’un autre compte ouverte pendant le détour OAuth', async () => {
    const identity = jest.spyOn(app.get(OAuthService), 'identity'); const browser = request.agent(app.getHttpServer()); const start = await browser.get('/api/auth/oauth/GITHUB/start').expect(302); const state = new URL(start.headers.location!).searchParams.get('state')!;
    await browser.post('/api/auth/login').set('X-CodeAudit-Request', '1').send({ email: other.email, password }).expect(200); const result = await browser.get(`/api/auth/oauth/GITHUB/callback?state=${state}&code=controlled`).expect(302); expect(result.headers.location).toContain('oauthError'); expect(identity).not.toHaveBeenCalled(); expect((await browser.get('/api/auth/me').expect(200)).body.user.id).toBe(other.userId);
  });
  it('refuse les fournisseurs non configurés sans exposer de secret', async () => {
    const secret = process.env.GITLAB_CLIENT_SECRET; delete process.env.GITLAB_CLIENT_SECRET;
    try { const response = await request(app.getHttpServer()).get('/api/auth/oauth/GITLAB/start').expect(503); expect(JSON.stringify(response.body)).not.toContain('controlled-test-secret'); const providers = (await request(app.getHttpServer()).get('/api/auth/oauth/providers').expect(200)).body; expect(providers.find((value: { provider: string }) => value.provider === 'GITLAB').configured).toBe(false); } finally { process.env.GITLAB_CLIENT_SECRET = secret; }
  });
});
