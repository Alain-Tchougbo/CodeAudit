import { Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { evaluateQualityGate, isQualityPolicy, type QualityGate } from '@codeaudit/contracts';
import { CurrentUser, ApiKeyAccess } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AnalysesService } from './analyses.service';
import { ReportExportService } from './report-export.service';
class QualityPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) @Max(1_000_000) maxErrors!: number;
  @IsInt() @Min(0) @Max(1_000_000) maxWarnings!: number;
}
const invalid = () => new ConflictException({ code: 'QUALITY_POLICY_INVALID', message: 'Les seuils enregistrés sont invalides.' });
@Controller()
export class QualityController {
  constructor(private readonly database: PrismaService, private readonly analyses: AnalysesService, private readonly reports: ReportExportService) {}
  @Get('projects/:projectId/quality-policy')
  async policy(@Param('projectId', ParseUUIDPipe) id: string, @CurrentUser() ownerId: string) {
    const project = await this.database.client.project.findUnique({ where: { id, ownerId }, select: { qualityPolicy: true } });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    if (project.qualityPolicy !== null && !isQualityPolicy(project.qualityPolicy)) throw invalid();
    return { policy: project.qualityPolicy };
  }
  @Put('projects/:projectId/quality-policy')
  async update(@Param('projectId', ParseUUIDPipe) id: string, @CurrentUser() ownerId: string, @Body() input: QualityPolicyDto) {
    const policy = { schemaVersion: 1, enabled: input.enabled, maxErrors: input.maxErrors, maxWarnings: input.maxWarnings };
    const updated = await this.database.client.project.updateMany({ where: { id, ownerId }, data: { qualityPolicy: policy } });
    if (!updated.count) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' }); return { policy };
  }
  @ApiKeyAccess() @Get('analyses/:id/quality-gate')
  async gate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() ownerId: string): Promise<QualityGate> {
    const analysis = await this.analyses.get(id, ownerId); const policy: unknown = analysis.qualityPolicySnapshot;
    if (policy !== null && !isQualityPolicy(policy)) throw invalid();
    let observed: QualityGate['observed'] = null;
    if (analysis.status === 'SUCCEEDED') {
      const statistics = this.reports.present(analysis).report.statistics;
      if (!statistics || typeof statistics !== 'object' || Array.isArray(statistics) || typeof statistics.errorCount !== 'number' || typeof statistics.warningCount !== 'number') throw invalid();
      observed = { errorCount: statistics.errorCount, warningCount: statistics.warningCount };
    }
    return { analysisId: id, ...evaluateQualityGate(policy, analysis.status, observed) };
  }
}
