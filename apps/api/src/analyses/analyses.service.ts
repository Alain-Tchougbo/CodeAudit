import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Analysis } from '@codeaudit/database';
import { AnalysisQueue, JobError, SourceStore, prepareSources } from '@codeaudit/analysis-jobs';
import type { AnalysisCodeContext, AnalysisSummary, ProjectSnapshot, GitSource, ProjectPermissions } from '@codeaudit/contracts';
import { gitSource } from './git-source';
import { validateCodeContext } from './code-context.schema';
import { PrismaService } from '../database/prisma.service';
import { projectAccessInclude, projectPermissions, projectReadScope, projectWriteScope, requireProjectAccess } from '../access/project-access';
import type { HistoryQuery } from './history.dto';

export const SUMMARY_SELECT = {
  cancelRequestedAt: true, heartbeatAt: true, deadlineAt: true,
  id: true, projectId: true, status: true, createdAt: true, startedAt: true, finishedAt: true,
  profileVersion: true, errorCode: true, errorMessage: true, statistics: true, projectSnapshot: true,
  sourceMetadata: true,
} as const satisfies Prisma.AnalysisSelect;

export function summary(record: Pick<Analysis, keyof typeof SUMMARY_SELECT>, permissions: ProjectPermissions): AnalysisSummary {
  const statistics = record.statistics as Record<string, number> | null;
  return {
    permissions,
    cancelRequestedAt: record.cancelRequestedAt?.toISOString() ?? null,
    heartbeatAt: record.heartbeatAt?.toISOString() ?? null,
    deadlineAt: record.deadlineAt?.toISOString() ?? null,
    id: record.id, projectId: record.projectId, status: record.status,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    profileVersion: record.profileVersion,
    source: gitSource(record.sourceMetadata),
    projectSnapshot: record.projectSnapshot as unknown as ProjectSnapshot | null,
    error: record.errorCode ? { code: record.errorCode, message: record.errorMessage ?? 'Analyse échouée.' } : null,
    statistics: statistics ? {
      analyzedFileCount: statistics.analyzedFileCount ?? 0,
      affectedFileCount: statistics.affectedFileCount ?? 0,
      errorCount: statistics.errorCount ?? 0,
      warningCount: statistics.warningCount ?? 0,
      syntaxErrorCount: statistics.syntaxErrorCount ?? 0,
    } : null,
  };
}

@Injectable()
export class AnalysesService {
  private activeImports = 0;
  constructor(private readonly database: PrismaService) {}

  async cancel(id: string, ownerId: string): Promise<AnalysisSummary> {
    const existing = await this.get(id, ownerId); await requireProjectAccess(this.database.client, existing.projectId, ownerId, 'write');
    const scope = { id, project: projectWriteScope(ownerId) };
    const now = new Date();
    const queued = await this.database.client.analysis.updateMany({ where: { ...scope, status: 'QUEUED' },
      data: { status: 'CANCELLED', cancelRequestedAt: now, finishedAt: now } });
    if (!queued.count) await this.database.client.analysis.updateMany({ where: { ...scope, status: 'RUNNING', cancelRequestedAt: null }, data: { cancelRequestedAt: now } });
    const record = await this.database.client.analysis.findUnique({ where: { id, project: projectReadScope(ownerId) }, select: { ...SUMMARY_SELECT, project: { include: projectAccessInclude(ownerId) } } });
    if (!record) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    if (record.status !== 'CANCELLED' && !(record.status === 'RUNNING' && record.cancelRequestedAt)) {
      throw new ConflictException({ code: 'ANALYSIS_ALREADY_FINISHED', message: 'Cette analyse est déjà terminée et ne peut plus être annulée.' });
    }
    return summary(record, projectPermissions(record.project, ownerId));
  }

  async create(projectId: string, archive: Buffer | undefined, ownerId: string, options: { captureContext?: boolean; gitSource?: GitSource; stripSingleRoot?: boolean } = {}): Promise<AnalysisSummary> {
    await requireProjectAccess(this.database.client, projectId, ownerId, 'write');
    if (!archive) throw new BadRequestException({ code: 'ARCHIVE_REQUIRED', message: 'Joignez une archive ZIP dans le champ archive.' });
    if (this.activeImports >= 2) throw new HttpException({ code: 'IMPORT_BUSY', message: 'Deux imports sont déjà en cours. Réessayez.' }, 429);
    this.activeImports++;
    let store: SourceStore | undefined;
    let sources: Awaited<ReturnType<typeof prepareSources>> | undefined;
    let enqueued = false;
    try {
      store = await SourceStore.open();
      sources = await prepareSources(store, archive, { stripSingleRoot: options.stripSingleRoot });
      const record = await new AnalysisQueue(this.database.client).enqueue(projectId, sources, { ...options, projectScope: projectWriteScope(ownerId) });
      enqueued = true;
      return this.status(record.id, ownerId);
    } catch (error) {
      if (!enqueued && sources && store) await store.remove(sources.key);
      if (error instanceof JobError) {
        const status = ['STORAGE_ERROR', 'ENGINE_CRASHED', 'MEMORY_LIMIT', 'THREAD_PROTOCOL_ERROR', 'ENGINE_FAILED'].includes(error.code) ? 500
          : error.code === 'EXTRACTION_TIMEOUT' ? 422
          : ['ZIP_TOO_LARGE', 'ZIP_FILE_TOO_LARGE', 'ZIP_EXPANDED_LIMIT', 'ZIP_ENTRY_LIMIT'].includes(error.code) ? 413 : 400;
        throw new HttpException({ code: error.code, message: error.message }, status);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(error.code)) {
        throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
      }
      throw error;
    } finally { this.activeImports--; }
  }

  async get(id: string, ownerId: string) {
    const analysis = await this.database.client.analysis.findUnique({ where: { id, project: projectReadScope(ownerId) }, include: { project: { include: projectAccessInclude(ownerId) } } });
    if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    return analysis;
  }

  async status(id: string, ownerId: string): Promise<AnalysisSummary> {
    const analysis = await this.database.client.analysis.findUnique({ where: { id, project: projectReadScope(ownerId) }, select: { ...SUMMARY_SELECT, project: { include: projectAccessInclude(ownerId) } } });
    if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    return summary(analysis, projectPermissions(analysis.project, ownerId));
  }

  async history(projectId: string, query: HistoryQuery, ownerId: string) {
    const project = await requireProjectAccess(this.database.client, projectId, ownerId);
    if (query.cursor && !await this.database.client.analysis.findFirst({ where: { id: query.cursor, projectId }, select: { id: true } })) {
      throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Curseur d’historique invalide.' });
    }
    const items = await this.database.client.analysis.findMany({
      where: { projectId }, select: SUMMARY_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const more = items.length > query.limit;
    const page = items.slice(0, query.limit);
    return { items: page.map(item => summary(item, projectPermissions(project, ownerId))), nextCursor: more ? page.at(-1)!.id : null };
  }

  async results(id: string, ownerId: string) {
    const analysis = await this.get(id, ownerId);
    if (analysis.status !== 'SUCCEEDED' || !analysis.report) {
      throw new ConflictException({ code: 'ANALYSIS_NOT_SUCCEEDED', message: 'Les résultats ne sont disponibles que pour une analyse réussie.' });
    }
    return analysis.report;
  }

  async context(id: string, ownerId: string): Promise<AnalysisCodeContext> {
    const analysis = await this.database.client.analysis.findUnique({ where: { id, project: projectReadScope(ownerId) }, select: { status: true, captureContext: true, codeContext: true } });
    if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    if (analysis.status !== 'SUCCEEDED') throw new ConflictException({ code: 'CONTEXT_NOT_AVAILABLE', message: 'Les extraits sont consultables après une analyse réussie.' });
    if (analysis.codeContext !== null && (!analysis.captureContext || !validateCodeContext(analysis.codeContext) || Buffer.byteLength(JSON.stringify(analysis.codeContext)) > 128 * 1024)) {
      throw new ConflictException({ code: 'CODE_CONTEXT_INVALID', message: 'Les extraits enregistrés sont invalides.' });
    }
    return { requested: analysis.captureContext, context: analysis.codeContext };
  }

  async deleteContext(id: string, ownerId: string): Promise<void> {
    const analysis = await this.database.client.analysis.findUnique({ where: { id, project: projectReadScope(ownerId) }, select: { status: true, projectId: true } });
    if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    await requireProjectAccess(this.database.client, analysis.projectId, ownerId, 'write');
    if (analysis.status === 'QUEUED' || analysis.status === 'RUNNING') throw new ConflictException({ code: 'ANALYSIS_NOT_FINISHED', message: 'Attendez la fin de l’analyse avant de supprimer les extraits.' });
    await this.database.client.analysis.update({ where: { id, project: projectWriteScope(ownerId) }, data: { codeContext: Prisma.DbNull, captureContext: false } });
  }
}
