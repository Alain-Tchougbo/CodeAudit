import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@codeaudit/database';
import { ANALYSIS_PROFILE_VERSION, getAnalysisProfile, type AnalysisReport } from '@codeaudit/analyzer';
import type { CodeContext, GitSource } from '@codeaudit/contracts';
import { CONTEXT_LIMITS } from './code-context';
import { EXECUTION_LIMITS, JobError } from './limits';
import type { SourceStore } from './storage';

export interface Claim {
  id: string;
  projectId: string;
  sourceKey: string | null;
  lockToken: string;
  deadlineAt: Date;
  captureContext?: boolean;
  profileVersion?: string | null;
}

export interface ReservationOptions { leaseMs?: number; analysisMs?: number }

export class AnalysisQueue {
  constructor(readonly client: PrismaClient) {}

  async enqueue(projectId: string, sources: { key: string; digest: string }, options: { captureContext?: boolean; gitSource?: GitSource } = {}) {
    return this.client.$transaction(async (transaction) => {
      const project = await transaction.project.findUniqueOrThrow({ where: { id: projectId } });
      getAnalysisProfile(project.analysisProfileVersion);
      return transaction.analysis.create({ data: {
        profileVersion: project.analysisProfileVersion,
        sourceMetadata: options.gitSource ? { ...options.gitSource } : Prisma.DbNull,
        projectId, sourceKey: sources.key, sourceDigest: sources.digest, captureContext: options.captureContext ?? false,
        projectSnapshot: { id: project.id, name: project.name, description: project.description, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString(),
          capturedAt: new Date().toISOString(), origin: 'ANALYSIS_REQUEST' },
      } });
    });
  }

  async claim(workerId: string, options: ReservationOptions = {}): Promise<Claim | null> {
    const leaseMs = options.leaseMs ?? EXECUTION_LIMITS.leaseMs;
    const analysisMs = options.analysisMs ?? EXECUTION_LIMITS.analysisMs;
    if (![leaseMs, analysisMs].every((value) => Number.isSafeInteger(value) && value > 0)) throw new JobError('INVALID_OPTIONS', 'Durées de réservation invalides.');
    const token = randomUUID();
    const rows = await this.client.$queryRaw<Claim[]>(Prisma.sql`
      WITH candidate AS (
        SELECT "id" FROM "Analysis"
        WHERE "status" = 'QUEUED'
        ORDER BY "createdAt", "id"
        FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE "Analysis" AS analysis SET
        "status" = 'RUNNING', "workerId" = ${workerId}, "lockToken" = ${token}::uuid,
        "startedAt" = clock_timestamp(), "heartbeatAt" = clock_timestamp(),
        "deadlineAt" = clock_timestamp() + ${analysisMs}::double precision * interval '1 millisecond',
        "leaseExpiresAt" = clock_timestamp() + LEAST(${leaseMs}::double precision, ${analysisMs}::double precision) * interval '1 millisecond'
      FROM candidate WHERE analysis."id" = candidate."id" AND analysis."status" = 'QUEUED'
      RETURNING analysis."id", analysis."projectId", analysis."sourceKey", analysis."lockToken", analysis."deadlineAt", analysis."captureContext", analysis."profileVersion"
    `);
    return rows[0] ?? null;
  }

  async heartbeat(id: string, token: string, leaseMs: number = EXECUTION_LIMITS.leaseMs): Promise<boolean> {
    const count = await this.client.$executeRaw(Prisma.sql`
      UPDATE "Analysis" SET "heartbeatAt" = clock_timestamp(),
        "leaseExpiresAt" = LEAST("deadlineAt", clock_timestamp() + ${leaseMs}::double precision * interval '1 millisecond')
      WHERE "id" = ${id}::uuid AND "lockToken" = ${token}::uuid AND "status" = 'RUNNING'
        AND "cancelRequestedAt" IS NULL
        AND "leaseExpiresAt" > clock_timestamp() AND "deadlineAt" > clock_timestamp()
    `);
    return count === 1;
  }

  async succeed(claim: Claim, report: AnalysisReport, context: CodeContext | null = null): Promise<boolean> {
    const json = JSON.stringify(report);
    const contextJson = context ? JSON.stringify(context) : null;
    if (contextJson && Buffer.byteLength(contextJson) > CONTEXT_LIMITS.storedBytes) throw new JobError('RESULT_TOO_LARGE', 'Les extraits sont trop volumineux.');
    if (Buffer.byteLength(json) > EXECUTION_LIMITS.reportBytes) throw new JobError('RESULT_TOO_LARGE', 'Rapport trop volumineux.');
    const count = await this.client.$executeRaw(Prisma.sql`
      UPDATE "Analysis" SET "status" = 'SUCCEEDED', "finishedAt" = clock_timestamp(),
        "report" = ${json}::jsonb, "statistics" = ${JSON.stringify(report.statistics)}::jsonb,
        "codeContext" = CASE WHEN "captureContext" THEN ${contextJson}::jsonb ELSE NULL END,
        "profileVersion" = ${report.profile.version}, "errorCode" = NULL, "errorMessage" = NULL,
        "lockToken" = NULL, "leaseExpiresAt" = NULL
      WHERE "id" = ${claim.id}::uuid AND "lockToken" = ${claim.lockToken}::uuid
        AND "status" = 'RUNNING' AND "leaseExpiresAt" > clock_timestamp() AND "deadlineAt" > clock_timestamp()
        AND "cancelRequestedAt" IS NULL
        AND COALESCE("profileVersion", ${ANALYSIS_PROFILE_VERSION}) = ${report.profile.version}
    `);
    return count === 1;
  }

  async fail(claim: Claim, code: string, message: string): Promise<boolean> {
    // Called only after the engine thread has stopped. Cancellation wins over a
    // concurrent engine failure; a cancelled run never publishes partial output.
    const count = await this.client.$executeRaw(Prisma.sql`
      UPDATE "Analysis" SET
        "status" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN 'CANCELLED'::"AnalysisStatus" ELSE 'FAILED'::"AnalysisStatus" END,
        "errorCode" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN NULL ELSE ${code.slice(0, 64)} END,
        "errorMessage" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN NULL ELSE ${message.slice(0, 500)} END,
        "finishedAt" = clock_timestamp(), "lockToken" = NULL, "leaseExpiresAt" = NULL
      WHERE "id" = ${claim.id}::uuid AND "lockToken" = ${claim.lockToken}::uuid AND "status" = 'RUNNING'
    `);
    return count === 1;
  }

  async recoverExpired(): Promise<number> {
    return this.client.$executeRaw(Prisma.sql`
      UPDATE "Analysis" SET "status" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN 'CANCELLED'::"AnalysisStatus" ELSE 'FAILED'::"AnalysisStatus" END, "finishedAt" = clock_timestamp(),
        "errorCode" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN NULL WHEN "deadlineAt" <= clock_timestamp() THEN 'ANALYSIS_TIMEOUT' ELSE 'WORKER_INTERRUPTED' END,
        "errorMessage" = CASE WHEN "cancelRequestedAt" IS NOT NULL THEN NULL WHEN "deadlineAt" <= clock_timestamp()
          THEN 'Le délai de traitement est dépassé.' ELSE 'Le worker a perdu sa réservation ou a été interrompu.' END,
        "lockToken" = NULL, "leaseExpiresAt" = NULL
      WHERE "status" = 'RUNNING' AND (
        "leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= clock_timestamp() OR "deadlineAt" <= clock_timestamp()
      )
    `);
  }

  async cleanup(store: SourceStore): Promise<{ removed: number; errors: number }> {
    const records = await this.client.analysis.findMany({
      where: { status: { in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] }, sourceKey: { not: null }, sourcesDeletedAt: null },
      orderBy: { createdAt: 'asc' }, take: 50,
      select: { id: true, sourceKey: true },
    });
    let removed = 0;
    let errors = 0;
    for (const record of records) {
      try {
        await store.remove(record.sourceKey!);
        await this.client.analysis.updateMany({
          where: { id: record.id, sourceKey: record.sourceKey, status: { in: ['SUCCEEDED', 'FAILED', 'CANCELLED'] } },
          data: { sourceKey: null, sourcesDeletedAt: new Date() },
        });
        removed++;
      } catch { errors++; }
    }
    return { removed, errors };
  }

  async maintenance(store: SourceStore): Promise<{ removed: number; errors: number }> {
    await this.recoverExpired();
    const cleanup = await this.cleanup(store);
    await store.reapOrphans(async (key) => (await this.client.analysis.count({ where: { sourceKey: key } })) > 0);
    return cleanup;
  }
}
