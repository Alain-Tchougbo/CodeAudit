import { createHash } from 'node:crypto';
import { createDatabaseClient } from '../../packages/database/dist';
function client() { const url = process.env.TEST_DATABASE_URL; if (!url || !/^\/[^/]+_test$/.test(new URL(url).pathname)) throw new Error('Dedicated _test database required'); return createDatabaseClient(url); }
export async function cleanupAccounts(ids: string[], emails: string[]) {
  const database = client();
  try {
    await database.project.deleteMany({ where: { ownerId: { in: ids } } });
    await database.team.deleteMany({ where: { createdById: { in: ids }, projects: { none: {} } } });
    await database.user.deleteMany({ where: { id: { in: ids } } });
    const hashes = ['login', 'register', 'reset', 'invite', 'verify', 'reauth', 'oauth'].flatMap((operation) => [`${operation}:ip:127.0.0.1`, ...[...emails, ...ids].map((value) => `${operation}:email:${value}`)]).map((key) => createHash('sha256').update(key).digest('hex'));
    await database.authThrottle.deleteMany({ where: { keyHash: { in: hashes } } });
  } finally { await database.$disconnect(); }
}
export async function expireSessions(userId: string) { const database = client(); try { await database.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } }); } finally { await database.$disconnect(); } }
