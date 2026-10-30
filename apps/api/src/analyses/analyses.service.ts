import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Analysis } from '@codeaudit/database';
import { AnalysisQueue, JobError, SourceStore, prepareSources } from '@codeaudit/analysis-jobs';
import type { AnalysisSummary } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import type { HistoryQuery } from './history.dto';

export const SUMMARY_SELECT = {
  id: true, projectId: true, status: true, createdAt: true, startedAt: true, finishedAt: true,
  profileVersion: true, errorCode: true, errorMessage: true, statistics: true,
} as const satisfies Prisma.AnalysisSelect;

export function summary(record: Pick<Analysis, keyof typeof SUMMARY_SELECT>): AnalysisSummary {
  const statistics = record.statistics as Record<string, number> | null;
  return {
    id: record.id, projectId: record.projectId, status: record.status,
    createdAt: record.createdAt.toISOString(),
    startedAt: record.startedAt?.toISOString() ?? null,
    finishedAt: record.finishedAt?.toISOString() ?? null,
    profileVersion: record.profileVersion,
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

  async create(projectId: string, archive?: Buffer): Promise<AnalysisSummary> {
    if (!await this.database.client.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    }
    if (!archive) throw new BadRequestException({ code: 'ARCHIVE_REQUIRED', message: 'Joignez une archive ZIP dans le champ archive.' });
    if (this.activeImports >= 2) throw new HttpException({ code: 'IMPORT_BUSY', message: 'Deux imports sont déjà en cours. Réessayez.' }, 429);
    this.activeImports++;
    let store: SourceStore | undefined;
    let sources: Awaited<ReturnType<typeof prepareSources>> | undefined;
    try {
      store = await SourceStore.open();
      sources = await prepareSources(store, archive);
      const record = await new AnalysisQueue(this.database.client).enqueue(projectId, sources);
      return summary(record);
    } catch (error) {
      if (sources && store) await store.remove(sources.key);
      if (error instanceof JobError) {
        const status = error.code === 'STORAGE_ERROR' ? 500
          : ['ZIP_TOO_LARGE', 'ZIP_FILE_TOO_LARGE', 'ZIP_EXPANDED_LIMIT', 'ZIP_ENTRY_LIMIT'].includes(error.code) ? 413 : 400;
        throw new HttpException({ code: error.code, message: error.message }, status);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
      }
      throw error;
    } finally { this.activeImports--; }
  }

  async get(id: string) {
    const analysis = await this.database.client.analysis.findUnique({ where: { id } });
    if (!analysis) throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    return analysis;
  }

  async status(id: string): Promise<AnalysisSummary> { return summary(await this.get(id)); }

  async history(projectId: string, query: HistoryQuery) {
    if (!await this.database.client.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    }
    if (query.cursor && !await this.database.client.analysis.findFirst({ where: { id: query.cursor, projectId }, select: { id: true } })) {
      throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Curseur d’historique invalide.' });
    }
    const items = await this.database.client.analysis.findMany({
      where: { projectId }, select: SUMMARY_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const more = items.length > query.limit;
    const page = items.slice(0, query.limit);
    return { items: page.map(summary), nextCursor: more ? page.at(-1)!.id : null };
  }

  async results(id: string) {
    const analysis = await this.get(id);
    if (analysis.status !== 'SUCCEEDED' || !analysis.report) {
      throw new ConflictException({ code: 'ANALYSIS_NOT_SUCCEEDED', message: 'Les résultats ne sont disponibles que pour une analyse réussie.' });
    }
    return analysis.report;
  }
}
