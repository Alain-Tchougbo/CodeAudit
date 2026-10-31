import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import requestLibrary from 'supertest';
import { signedIn, clearTestThrottle } from './auth-helper';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/database/prisma.service';

describe('Projets : API et PostgreSQL réel', () => {
  let app: INestApplication;
  let api: ReturnType<typeof requestLibrary.agent>;
  let userId: string;
  let email: string;
  let database: PrismaService;
  const ids = new Set<string>();
  const prefix = `integration-${randomUUID()}-`;
  const previousUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) {
      throw new Error('TEST_DATABASE_URL doit désigner une base dédiée dont le nom se termine par _test.');
    }
    process.env.DATABASE_URL = url;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get(PrismaService);
    ({ api, userId, email } = await signedIn(app));
  });

  afterAll(async () => {
    try {
      if (database) await database.client.project.deleteMany({ where: { id: { in: [...ids] } } });
    } finally {
      if (database && userId) { await database.client.user.deleteMany({ where: { id: userId } }); await clearTestThrottle(database.client, [email]); }
      if (app) await app.close();
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    }
  });

  async function create(suffix = 'projet') {
    const response = await api.post('/api/projects')
      .send({ name: prefix + suffix, description: 'Description initiale' }).expect(201);
    ids.add(response.body.id as string);
    return response.body as { id: string; name: string; description: string; createdAt: string; updatedAt: string };
  }

  it('crée et persiste un projet normalisé avec UUID et dates', async () => {
    const response = await api.post('/api/projects')
      .send({ name: `  ${prefix}normalisé  `, description: '   ' }).expect(201);
    ids.add(response.body.id as string);
    expect(response.body).toMatchObject({ name: prefix + 'normalisé', description: null });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(response.body.createdAt as string))).toBe(false);
    const stored = await database.client.project.findUnique({ where: { id: response.body.id as string } });
    expect(stored?.name).toBe(prefix + 'normalisé');
  });

  it('liste et consulte les projets persistés', async () => {
    const project = await create('lecture');
    const list = await api.get('/api/projects').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: project.id })]));
    await api.get(`/api/projects/${project.id}`).expect(200).expect(project);
  });

  it('accepte des noms identiques : seul l’identifiant est unique', async () => {
    const first = await create('même-nom');
    const second = await create('même-nom');
    expect(first.id).not.toBe(second.id);
  });

  it('modifie partiellement et permet d’effacer la description', async () => {
    const project = await create('modification');
    const updated = await api.patch(`/api/projects/${project.id}`)
      .send({ description: null }).expect(200);
    expect(updated.body).toMatchObject({ name: project.name, description: null, createdAt: project.createdAt });
    const renamed = await api.patch(`/api/projects/${project.id}`)
      .send({ name: ` ${prefix}renommé ` }).expect(200);
    expect(renamed.body.name).toBe(prefix + 'renommé');
    expect(renamed.body.description).toBeNull();
  });

  it.each([
    {}, { name: '' }, { name: '   ' }, { name: null }, { name: 42 },
    { name: 'x'.repeat(121) }, { name: 'ok', description: 42 },
    { name: 'ok', description: 'x'.repeat(2001) }, { name: 'ok', unknown: true },
    [],
  ])('rejette les données de création invalides (%j)', async (body) => {
    const response = await api.post('/api/projects').send(body).expect(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.requestId).toBeTruthy();
  });

  it.each([{}, { name: null }, { name: '  ' }, { description: 7 }, { unknown: true }])(
    'rejette une modification invalide (%j)', async (body) => {
      const project = await create('invalide');
      await api.patch(`/api/projects/${project.id}`).send(body).expect(400);
      expect((await database.client.project.findUniqueOrThrow({ where: { id: project.id } })).name).toBe(project.name);
    },
  );

  it.each(['get', 'patch', 'delete'] as const)('renvoie 404 pour %s d’un UUID inexistant', async (method) => {
    const operation = api[method](`/api/projects/${randomUUID()}`);
    if (method === 'patch') operation.send({ name: 'Projet' });
    const response = await operation.expect(404);
    expect(response.body.code).toBe('PROJECT_NOT_FOUND');
  });

  it('rejette un identifiant mal formé', async () => {
    await api.get('/api/projects/pas-un-uuid').expect(400);
  });

  it('supprime un projet et renvoie 404 ensuite', async () => {
    const project = await create('suppression');
    await api.delete(`/api/projects/${project.id}`).expect(204).expect('');
    expect(await database.client.project.findUnique({ where: { id: project.id } })).toBeNull();
    await api.delete(`/api/projects/${project.id}`).expect(404);
  });

  it.each(['QUEUED', 'RUNNING'] as const)('refuse la suppression avec une analyse %s', async (status) => {
    const project = await create('actif');
    await database.client.analysis.create({ data: { projectId: project.id, status } });
    const response = await api.delete(`/api/projects/${project.id}`).expect(409);
    expect(response.body.code).toBe('PROJECT_BUSY');
    expect(await database.client.project.findUnique({ where: { id: project.id } })).not.toBeNull();
  });

  it('supprime en cascade uniquement lorsque les analyses sont terminées', async () => {
    const project = await create('cascade');
    await database.client.analysis.createMany({
      data: [{ projectId: project.id, status: 'SUCCEEDED' }, { projectId: project.id, status: 'FAILED' }],
    });
    await api.delete(`/api/projects/${project.id}`).expect(204);
    expect(await database.client.analysis.count({ where: { projectId: project.id } })).toBe(0);
  });

  it('interdit une analyse orpheline au niveau PostgreSQL', async () => {
    await expect(database.client.analysis.create({ data: { projectId: randomUUID() } }))
      .rejects.toMatchObject({ code: 'P2003' });
  });

  it('interdit un nom vide même lors d’une écriture SQL directe', async () => {
    await expect(database.client.$executeRaw`INSERT INTO "Project" ("name") VALUES ('   ')`).rejects.toThrow();
  });
});
