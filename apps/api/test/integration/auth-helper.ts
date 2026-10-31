import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@codeaudit/database';
import { throttleKey } from '../../src/auth/auth.service';
export async function signedIn(app: INestApplication) {
  const api = request.agent(app.getHttpServer());
  const email = `integration-${randomUUID()}@example.test`;
  const response = await api.post('/api/auth/register').set('X-CodeAudit-Request', '1').send({ name: 'Integration User', email, password: 'Integration password 2026!' }).expect(201);
  api.set('X-CodeAudit-Request', '1'); api.set('X-CSRF-Token', response.body.csrfToken as string);
  return { api, userId: response.body.user.id as string, email };
}
export async function clearTestThrottle(client: PrismaClient, emails: string[] = []) {
  const keys = ['login', 'register'].flatMap((operation) => [throttleKey(operation, 'ip', '127.0.0.1'), ...emails.map((email) => throttleKey(operation, 'email', email))]);
  await client.authThrottle.deleteMany({ where: { keyHash: { in: keys } } });
}
