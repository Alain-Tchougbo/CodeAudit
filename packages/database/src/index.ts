import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { databaseUrl } from './environment';

export { Prisma, PrismaClient, AnalysisStatus, TeamRole } from './generated/prisma/client';
export type { Project, Analysis, ApiKey } from './generated/prisma/client';

export function createDatabaseClient(url = databaseUrl()): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5000 }),
  });
}
