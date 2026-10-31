import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Test } from '@nestjs/testing';
import { NotFoundException, type INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import { AnalysisQueue, SourceStore, prepareSources, processNext } from '@codeaudit/analysis-jobs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';
import { MailService } from '../../src/auth/mail.service';
import { AnalysesService } from '../../src/analyses/analyses.service';
import { projectWriteScope } from '../../src/access/project-access';
import { signedIn, clearTestThrottle } from './auth-helper';
import { invitationLink } from '../../../../tests/mailpit';
import { zip } from '../../../../packages/analysis-jobs/test/zip-builder';
jest.setTimeout(60000);
type Account = Awaited<ReturnType<typeof signedIn>>;
describe('Équipes — droits HTTP, PostgreSQL, SMTP et moteur réels', () => {
  let app: INestApplication; let client: PrismaClient; let root: string;
  let admin: Account; let second: Account; let member: Account; let reader: Account; let outsider: Account;
  let teamId: string; let projectId: string; const projectIds: string[] = []; const teamIds: string[] = [];
  const env = Object.fromEntries(['DATABASE_URL', 'CODEAUDIT_STORAGE_ROOT', 'SMTP_HOST', 'SMTP_PORT', 'AUTH_APP_ORIGIN'].map(key => [key, process.env[key]]));
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required');
    process.env.DATABASE_URL = url; root = await mkdtemp(resolve(tmpdir(), 'codeaudit-teams-')); process.env.CODEAUDIT_STORAGE_ROOT = root;
    process.env.SMTP_HOST = '127.0.0.1'; process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? '1026'; process.env.AUTH_APP_ORIGIN = 'http://127.0.0.1:5173';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); client = app.get(PrismaService).client;
    admin = await signedIn(app); second = await signedIn(app); member = await signedIn(app); reader = await signedIn(app); outsider = await signedIn(app);
  });
  beforeEach(async () => {
    teamId = (await admin.api.post('/api/teams').send({ name: 'Platform' }).expect(201)).body.id as string; teamIds.push(teamId);
    // Matrix fixtures only; a separate SMTP test proves the actual invitation flow.
    await client.teamMember.createMany({ data: [{ teamId, userId: second.userId, role: 'ADMIN' }, { teamId, userId: member.userId, role: 'MEMBER' }, { teamId, userId: reader.userId, role: 'READER' }] });
    projectId = (await admin.api.post('/api/projects').send({ name: 'Shared audit' }).expect(201)).body.id as string; projectIds.push(projectId);
    await clearTestThrottle(client);
  });
  afterEach(async () => {
    jest.restoreAllMocks(); await client.project.deleteMany({ where: { id: { in: projectIds.splice(0) } } }); await client.team.deleteMany({ where: { id: { in: teamIds.splice(0) } } });
  });
  afterAll(async () => {
    if (client && admin) { const accounts = [admin, second, member, reader, outsider]; await client.user.deleteMany({ where: { id: { in: accounts.map(account => account.userId) } } }); await clearTestThrottle(client, accounts.map(account => account.email)); }
    if (app) await app.close(); if (root) { if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('codeaudit-teams-')) throw new Error('Unsafe cleanup'); await rm(root, { recursive: true, force: true }); }
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  const team = () => `/api/teams/${teamId}`; const project = () => `/api/projects/${projectId}`;
  const share = () => admin.api.put(`${project()}/team`).send({ teamId }).expect(204);
  const archive = zip([{ name: 'index.js', data: "missing;\nconsole.log('hello');" }]);
  async function enqueue(account = admin) { return (await account.api.post(`${project()}/analyses`).field('captureContext', 'true').attach('archive', archive, 'source.zip').expect(202)).body.id as string; }
  const work = async () => processNext(new AnalysisQueue(client), await SourceStore.open(), 'teams-worker');
  async function analyzed() { const id = await enqueue(); await work(); return id; }
  async function key(account = member) { return (await account.api.post(`${project()}/api-keys`).send({ name: 'Team CI', expiresInDays: 1 }).expect(201)).body as { token: string; key: { id: string } }; }
  async function invite(role: 'MEMBER' | 'READER' = 'READER') {
    const response = await admin.api.post(`${team()}/invitations`).send({ email: outsider.email.toUpperCase(), role }).expect(202);
    const token = new URLSearchParams(new URL(await invitationLink(outsider.email)).hash.slice(1)).get('token')!;
    expect(JSON.stringify(response.body)).not.toContain(token); return token;
  }
  it('valide les entrées et protège les équipes, invitations et adresses des membres', async () => {
    await request(app.getHttpServer()).get('/api/teams').expect(401); await outsider.api.get(team()).expect(404);
    await admin.api.post('/api/teams').send({ name: 'A\nB' }).expect(400); await admin.api.post('/api/teams').send({ name: ' ', role: 'ADMIN' }).expect(400);
    await admin.api.patch(team()).set('X-CSRF-Token', '').send({ name: 'Other' }).expect(403);
    for (const account of [member, reader]) { await account.api.patch(team()).send({ name: 'Other' }).expect(403); await account.api.get(`${team()}/invitations`).expect(403); const result = await account.api.get(team()).expect(200); expect(result.body.members.every((item: { email?: string }) => item.email === undefined)).toBe(true); }
    expect((await admin.api.get(team()).expect(200)).body.members[0].email).toBeDefined(); expect((await outsider.api.get('/api/teams').expect(200)).body).toEqual([]);
    await admin.api.post(`${team()}/invitations`).send({ email: outsider.email, role: 'ADMIN' }).expect(400); await admin.api.post(`${team()}/invitations`).send({ email: outsider.email, role: 'READER', token: 'chosen' }).expect(400);
  });
  it('garde un projet personnel privé et partage seulement après demande explicite', async () => {
    await reader.api.get(project()).expect(404); await reader.api.put(`${project()}/team`).send({ teamId }).expect(403);
    const before = await key(admin); await share(); expect(await client.apiKey.count({ where: { id: before.key.id } })).toBe(0);
    expect((await member.api.get(project()).expect(200)).body).toMatchObject({ team: { id: teamId, name: 'Platform' }, permissions: { write: true, admin: false } });
    expect((await reader.api.get(project()).expect(200)).body.permissions).toEqual({ write: false, admin: false });
    expect((await second.api.get(project()).expect(200)).body.permissions).toEqual({ write: true, admin: true });
    await outsider.api.get(project()).expect(404); await outsider.api.put(`${project()}/team`).send({ teamId }).expect(404);
    expect((await reader.api.get('/api/projects').expect(200)).body.map((item: { id: string }) => item.id)).toEqual([projectId]);
    expect((await outsider.api.get('/api/dashboard').expect(200)).body.projectCount).toBe(0);
    const legacy = await client.project.create({ data: { name: 'Quarantined' } }); projectIds.push(legacy.id); await reader.api.get(`/api/projects/${legacy.id}`).expect(404);
    await admin.api.delete(team()).expect(409); await share();
  });
  it('partage les vrais rapports historiques, comparaisons, extraits et compteurs sans les réécrire', async () => {
    const baseline = await analyzed(); const target = await analyzed(); const report = (await admin.api.get(`/api/analyses/${target}/report`).expect(200)).body;
    await reader.api.get(`/api/analyses/${target}/report`).expect(404); await share();
    for (const account of [member, reader, second]) {
      const history = (await account.api.get(`${project()}/analyses`).expect(200)).body; expect(history.items).toHaveLength(2); expect(history.items.every((item: { permissions: { write: boolean } }) => item.permissions.write === (account !== reader))).toBe(true);
      for (const suffix of ['', '/results', '/context', '/quality-gate', `/comparison?baselineId=${baseline}`]) await account.api.get(`/api/analyses/${target}${suffix}`).expect(200);
      expect((await account.api.get(`/api/analyses/${target}/report`).expect(200)).body).toEqual(report);
      const dashboard = (await account.api.get('/api/dashboard').expect(200)).body; expect(dashboard).toMatchObject({ projectCount: 1, analysisCount: 2, succeededCount: 2, errorCount: 2, warningCount: 2 });
    }
    await outsider.api.get(`/api/analyses/${target}/report`).expect(404); expect((await outsider.api.get('/api/dashboard').expect(200)).body.analysisCount).toBe(0);
  });
  it('refuse toutes les mutations de projet et analyse au lecteur par HTTP direct', async () => {
    const id = await analyzed(); await share();
    await reader.api.patch(project()).send({ name: 'Attack' }).expect(403); await reader.api.delete(project()).expect(403);
    await reader.api.post(`${project()}/analyses`).attach('archive', archive, 'source.zip').expect(403);
    await reader.api.post(`${project()}/analyses/github`).send({ repository: 'expressjs/cookie-parser' }).expect(403);
    await reader.api.post(`/api/analyses/${id}/cancel`).expect(403); await reader.api.delete(`/api/analyses/${id}/context`).expect(403);
    await reader.api.put(`${project()}/rule-profile`).send({ version: 'codeaudit-js-ts-strict-v1' }).expect(403);
    await reader.api.put(`${project()}/quality-policy`).send({ enabled: true, maxErrors: 0, maxWarnings: 0 }).expect(403);
    for (const method of ['get', 'post'] as const) await reader.api[method](`${project()}/api-keys`).send(method === 'post' ? { name: 'Attack', expiresInDays: 1 } : undefined).expect(403);
    expect((await reader.api.get(`/api/analyses/${id}/context`).expect(200)).body.context).not.toBeNull();
  });
  it('autorise le membre à analyser, annuler et modifier sans administrer les réglages', async () => {
    await share(); await member.api.patch(project()).send({ name: 'Updated by member' }).expect(200);
    const id = await enqueue(member); await member.api.post(`/api/analyses/${id}/cancel`).expect(202); await member.api.delete(`/api/analyses/${id}/context`).expect(204);
    await member.api.put(`${project()}/quality-policy`).send({ enabled: true, maxErrors: 0, maxWarnings: 0 }).expect(403); await member.api.put(`${project()}/rule-profile`).send({ version: 'codeaudit-js-ts-strict-v1' }).expect(403); await member.api.delete(project()).expect(403);
    await admin.api.put(`${project()}/quality-policy`).send({ enabled: true, maxErrors: 0, maxWarnings: 0 }).expect(200);
    await second.api.put(`${project()}/rule-profile`).send({ version: 'codeaudit-js-ts-strict-v1' }).expect(200);
    const created = await key(); await admin.api.delete(`${project()}/api-keys/${created.key.id}`).expect(404);
  });
  it('révoque immédiatement les accès du créateur retiré, malgré ownerId, et ses clés CI', async () => {
    const baseline = await analyzed(); const target = await analyzed(); await share(); const created = await key(admin);
    await second.api.delete(`${team()}/members/${admin.userId}`).expect(204);
    for (const suffix of ['', '/analyses', '/quality-policy', '/rule-profile', '/api-keys']) await admin.api.get(`${project()}${suffix}`).expect(404);
    for (const suffix of ['', '/results', '/report', '/context', '/quality-gate', `/comparison?baselineId=${baseline}`]) await admin.api.get(`/api/analyses/${target}${suffix}`).expect(404);
    await admin.api.patch(project()).send({ name: 'Creator bypass' }).expect(404); await admin.api.delete(project()).expect(404); await admin.api.delete(`/api/analyses/${target}/context`).expect(404);
    expect((await admin.api.get('/api/projects').expect(200)).body).toEqual([]); expect((await admin.api.get('/api/dashboard').expect(200)).body).toMatchObject({ projectCount: 0, analysisCount: 0, errorCount: 0, warningCount: 0, latestAnalyses: [] });
    await request(app.getHttpServer()).get(`/api/analyses/${target}`).set('Authorization', `Bearer ${created.token}`).expect(401);
    expect((await client.project.findUniqueOrThrow({ where: { id: projectId } })).ownerId).toBe(admin.userId); await member.api.get(project()).expect(200);
  });
  it('révoque les clés lors d’un changement de rôle et ne permet pas au lecteur de les recréer', async () => {
    await share(); const created = await key(); const id = await enqueue();
    await admin.api.put(`${team()}/members/${member.userId}`).send({ role: 'READER' }).expect(204);
    await request(app.getHttpServer()).get(`/api/analyses/${id}`).set('Authorization', `Bearer ${created.token}`).expect(401); await member.api.post(`${project()}/api-keys`).send({ name: 'Again', expiresInDays: 1 }).expect(403);
    expect((await member.api.get(project()).expect(200)).body.permissions.write).toBe(false);
  });
  it('revérifie les droits dans la transaction d’enqueue après la préparation des sources', async () => {
    await share(); const store = await SourceStore.open(); const sources = await prepareSources(store, archive);
    try { await admin.api.delete(`${team()}/members/${member.userId}`).expect(204); await expect(new AnalysisQueue(client).enqueue(projectId, sources, { projectScope: projectWriteScope(member.userId) })).rejects.toMatchObject({ code: 'P2025' }); expect(await client.analysis.count({ where: { projectId } })).toBe(0); }
    finally { await store.remove(sources.key); }
  });
  it('ne supprime pas les sources confiées au worker si la réponse HTTP ne peut plus être présentée', async () => {
    await share(); const service = app.get(AnalysesService); const status = jest.spyOn(service, 'status').mockRejectedValueOnce(new NotFoundException());
    await member.api.post(`${project()}/analyses`).attach('archive', archive, 'source.zip').expect(404); status.mockRestore();
    const queued = await client.analysis.findFirstOrThrow({ where: { projectId } }); expect(queued.sourceKey).not.toBeNull(); await expect((await SourceStore.open()).sources(queued.sourceKey!)).resolves.toBeTruthy();
    await work(); expect((await client.analysis.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('SUCCEEDED');
  });
  it('préserve au moins un administrateur face à deux départs concurrents', async () => {
    const responses = await Promise.all([admin.api.delete(`${team()}/members/${admin.userId}`), second.api.delete(`${team()}/members/${second.userId}`)]);
    expect(responses.map(response => response.status).sort()).toEqual([204, 409]); expect(await client.teamMember.count({ where: { teamId, role: 'ADMIN' } })).toBe(1);
    const survivor = responses[0]!.status === 204 ? second : admin; expect((await survivor.api.put(`${team()}/members/${survivor.userId}`).send({ role: 'READER' }).expect(409)).body.code).toBe('LAST_TEAM_ADMIN');
  });
  it('autorise un lecteur à quitter et supprime seulement une équipe vide explicitement', async () => {
    await reader.api.delete(`${team()}/members/${reader.userId}`).expect(204); await reader.api.get(team()).expect(404); await member.api.delete(`${team()}/members/${admin.userId}`).expect(403);
    await share(); await admin.api.delete(team()).expect(409); await admin.api.delete(project()).expect(204); await second.api.delete(team()).expect(204); await second.api.get(team()).expect(404);
  });
  it('envoie réellement un lien SMTP, exige le bon compte et consomme le jeton une seule fois', async () => {
    const token = await invite(); expect(await client.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: outsider.userId } } })).toBeNull();
    const invitation = await client.teamInvitation.findUniqueOrThrow({ where: { teamId_email: { teamId, email: outsider.email } } }); expect(invitation.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify((await admin.api.get(`${team()}/invitations`).expect(200)).body)).not.toContain(token);
    await member.api.post('/api/team-invitations/preview').send({ token }).expect(403); await outsider.api.post('/api/team-invitations/accept').set('X-CSRF-Token', '').send({ token }).expect(403);
    expect((await outsider.api.post('/api/team-invitations/preview').send({ token }).expect(200)).body).toMatchObject({ teamId, role: 'READER' });
    await outsider.api.post('/api/team-invitations/accept').send({ token }).expect(200); await outsider.api.post('/api/team-invitations/accept').send({ token }).expect(400);
    expect((await outsider.api.get(team()).expect(200)).body.role).toBe('READER');
  });
  it('empêche deux acceptations simultanées de créer plusieurs adhésions', async () => {
    const token = await invite('MEMBER'); const responses = await Promise.all([outsider.api.post('/api/team-invitations/accept').send({ token }), outsider.api.post('/api/team-invitations/accept').send({ token })]);
    expect(responses.filter(response => response.status === 200)).toHaveLength(1); expect([400, 409]).toContain(responses.find(response => response.status !== 200)!.status); expect(await client.teamMember.count({ where: { teamId, userId: outsider.userId } })).toBe(1);
  });
  it('invalide un ancien lien après renvoi puis révoque le nouveau lien', async () => {
    const first = await invite(); const secondToken = await invite('MEMBER'); expect(first).not.toBe(secondToken); await outsider.api.post('/api/team-invitations/accept').send({ token: first }).expect(400);
    const invitation = await client.teamInvitation.findUniqueOrThrow({ where: { teamId_email: { teamId, email: outsider.email } } }); await admin.api.delete(`${team()}/invitations/${invitation.id}`).expect(204); await outsider.api.post('/api/team-invitations/accept').send({ token: secondToken }).expect(400);
  });
  it('refuse un lien expiré et limite les renvois par équipe et adresse', async () => {
    const token = await invite(); await client.teamInvitation.updateMany({ where: { teamId }, data: { createdAt: new Date(Date.now() - 8 * 86400000), expiresAt: new Date(Date.now() - 1000) } });
    await outsider.api.post('/api/team-invitations/accept').send({ token }).expect(400); expect((await admin.api.get(`${team()}/invitations`).expect(200)).body).toEqual([]);
    await invite(); await invite(); await admin.api.post(`${team()}/invitations`).send({ email: outsider.email, role: 'MEMBER' }).expect(429);
  });
  it('ne conserve aucune invitation valable après un échec SMTP', async () => {
    jest.spyOn(app.get(MailService), 'invite').mockRejectedValue(new Error('simulated transport failure'));
    await admin.api.post(`${team()}/invitations`).send({ email: outsider.email, role: 'READER' }).expect(503); expect(await client.teamInvitation.count({ where: { teamId } })).toBe(0);
  });
  it('révoque les invitations en attente d’un administrateur rétrogradé', async () => {
    await invite(); await second.api.put(`${team()}/members/${admin.userId}`).send({ role: 'MEMBER' }).expect(204); expect(await client.teamInvitation.count({ where: { teamId } })).toBe(0);
  });
});

