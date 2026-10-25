import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';

describe('GET /health', () => {
  it('expose la santé du processus HTTP indépendamment des requêtes métier', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({}).compile();
    const app = module.createNestApplication();
    configureApp(app);
    await app.init();
    try {
      await request(app.getHttpServer()).get('/health').expect(200).expect({
        status: 'ok', service: 'codeaudit-api',
      });
    } finally {
      await app.close();
    }
  });
});
