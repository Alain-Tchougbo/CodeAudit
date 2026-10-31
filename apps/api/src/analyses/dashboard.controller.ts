import { Controller, Get } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { Dashboard } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { summary, SUMMARY_SELECT } from './analyses.service';
import { CurrentUser } from '../auth/auth.types';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  async get(@CurrentUser() userId: string): Promise<Dashboard> {
    return this.database.client.$transaction(async (transaction) => {
      const projectCount = await transaction.project.count({ where: { ownerId: userId } });
      const [counts] = await transaction.$queryRaw<Omit<Dashboard, 'projectCount' | 'latestAnalyses'>[]>(Prisma.sql`
        SELECT COUNT(*)::float8 AS "analysisCount",
          COUNT(*) FILTER (WHERE status IN ('SUCCEEDED', 'FAILED'))::float8 AS "completedCount",
          COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::float8 AS "succeededCount",
          COUNT(*) FILTER (WHERE status = 'FAILED')::float8 AS "failedCount",
          COUNT(*) FILTER (WHERE status = 'QUEUED')::float8 AS "queuedCount",
          COUNT(*) FILTER (WHERE status = 'RUNNING')::float8 AS "runningCount",
          COALESCE(SUM((statistics->>'errorCount')::bigint) FILTER (WHERE status = 'SUCCEEDED'), 0)::float8 AS "errorCount",
          COALESCE(SUM((statistics->>'warningCount')::bigint) FILTER (WHERE status = 'SUCCEEDED'), 0)::float8 AS "warningCount"
        FROM "Analysis" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "ownerId" = ${userId}::uuid)
      `);
      const recent = await transaction.analysis.findMany({
        where: { project: { ownerId: userId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10,
        select: { ...SUMMARY_SELECT, project: { select: { name: true } } },
      });
      return { projectCount, ...counts!, latestAnalyses: recent.map((item) => ({ ...summary(item), projectName: item.project.name })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
