import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import type { AnalysisComparison, AnalysisResults } from '@codeaudit/contracts';
import { AnalysesService, summary } from './analyses.service';
import { ReportExportService } from './report-export.service';
import { compareIssues } from './compare-issues';
import { projectPermissions } from '../access/project-access';

export class ComparisonQuery { @IsUUID() baselineId!: string; }
type ComparableReport = AnalysisResults & { limits: unknown; files: { filePath: string }[] };

@Injectable()
export class ComparisonService {
  constructor(private readonly analyses: AnalysesService, private readonly exports: ReportExportService) {}
  async compare(targetId: string, baselineId: string, ownerId: string): Promise<AnalysisComparison> {
    // Both ownership checks precede validation of state, project and compatibility.
    const [baseline, target] = await Promise.all([this.analyses.get(baselineId, ownerId), this.analyses.get(targetId, ownerId)]);
    if (targetId === baselineId) throw new BadRequestException({ code: 'SAME_ANALYSIS', message: 'Sélectionnez deux analyses différentes.' });
    if (baseline.projectId !== target.projectId) throw new BadRequestException({ code: 'DIFFERENT_PROJECTS', message: 'Les analyses doivent appartenir au même projet.' });
    // Reuse export's strict runtime validation and consistency checks on stored records.
    const before = this.exports.present(baseline).report as unknown as ComparableReport;
    const after = this.exports.present(target).report as unknown as ComparableReport;
    if (!isDeepStrictEqual(before.profile, after.profile) || !isDeepStrictEqual(before.limits, after.limits)) {
      throw new ConflictException({ code: 'INCOMPATIBLE_ANALYSES', message: 'Les profils de règles, versions des moteurs ou limites diffèrent. Ces analyses ne sont pas comparables.' });
    }
    const beforeFiles = new Set(before.files.map(file => file.filePath)); const afterFiles = new Set(after.files.map(file => file.filePath));
    return {
      schemaVersion: 1, matchingVersion: 'file-rule-message-v1', baseline: summary(baseline, projectPermissions(baseline.project, ownerId)), target: summary(target, projectPermissions(target.project, ownerId)),
      ...compareIssues(before.issues, after.issues),
      deltas: { errorCount: after.statistics.errorCount - before.statistics.errorCount, warningCount: after.statistics.warningCount - before.statistics.warningCount,
        analyzedFileCount: after.statistics.analyzedFileCount - before.statistics.analyzedFileCount, affectedFileCount: after.statistics.affectedFileCount - before.statistics.affectedFileCount },
      coverage: { newlyAnalyzedFiles: [...afterFiles].filter(file => !beforeFiles.has(file)).sort(), noLongerAnalyzedFiles: [...beforeFiles].filter(file => !afterFiles.has(file)).sort() },
    };
  }
}
