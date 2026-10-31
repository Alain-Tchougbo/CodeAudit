import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { ConflictException, Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { AnalysisExport } from '@codeaudit/contracts';
import { AnalysesService } from './analyses.service';

const schema = JSON.parse(readFileSync(require.resolve('@codeaudit/contracts/schemas/report-export.v1.schema.json'), 'utf8'));
const validator = new Ajv({ allErrors: true, strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
addFormats(validator);
export const validateReportExport = validator.compile<AnalysisExport>(schema);

@Injectable()
export class ReportExportService {
  constructor(private readonly analyses: AnalysesService) {}

  async export(id: string, ownerId: string): Promise<AnalysisExport> {
    const stored = await this.analyses.get(id, ownerId);
    if (stored.status === 'QUEUED' || stored.status === 'RUNNING') {
      throw new ConflictException({ code: 'ANALYSIS_NOT_FINISHED', message: 'L’analyse n’est pas encore terminée. Réessayez après la fin du traitement.' });
    }
    if (stored.status === 'FAILED') {
      throw new ConflictException({ code: 'ANALYSIS_FAILED', message: 'Cette analyse a échoué techniquement et ne possède pas de rapport exportable.' });
    }
    if (!stored.report || !stored.projectSnapshot || !stored.startedAt || !stored.finishedAt) {
      throw new ConflictException({ code: 'REPORT_UNAVAILABLE', message: 'Le rapport ou ses métadonnées enregistrées sont incomplets.' });
    }
    const document: unknown = {
      schemaVersion: 1,
      project: stored.projectSnapshot,
      analysis: {
        id: stored.id, projectId: stored.projectId, status: stored.status,
        createdAt: stored.createdAt.toISOString(), startedAt: stored.startedAt.toISOString(), finishedAt: stored.finishedAt.toISOString(),
        durationMs: stored.finishedAt.getTime() - stored.startedAt.getTime(), profileVersion: stored.profileVersion, error: null,
      },
      report: stored.report,
    };
    // Validation never changes persisted values or substitutes today's engine/profile.
    if (!validateReportExport(document)) {
      throw new ConflictException({ code: 'REPORT_SCHEMA_INVALID', message: 'Le rapport enregistré ne respecte pas le schéma d’export pris en charge.' });
    }
    if (stored.errorCode !== null || stored.errorMessage !== null || document.project.id !== stored.projectId || document.report.profile === null
      || (document.report.profile as { version?: string }).version !== stored.profileVersion
      || !isDeepStrictEqual(stored.statistics, (stored.report as Record<string, unknown>).statistics)) {
      throw new ConflictException({ code: 'REPORT_INCONSISTENT', message: 'Les métadonnées et le rapport enregistrés sont incohérents.' });
    }
    return document;
  }
}
