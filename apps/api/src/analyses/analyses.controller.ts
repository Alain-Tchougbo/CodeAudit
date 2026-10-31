import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMPORT_LIMITS } from '@codeaudit/analysis-jobs';
import { AnalysesService } from './analyses.service';
import { HistoryQuery } from './history.dto';
import { ReportExportService } from './report-export.service';
import { CurrentUser } from '../auth/auth.types';
import { ComparisonQuery, ComparisonService } from './comparison.service';
import { AnalysisOptions } from './analysis-options.dto';

@Controller()
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService, private readonly exports: ReportExportService, private readonly comparisons: ComparisonService) {}

  @Get('analyses/:id/comparison')
  comparison(@Param('id', ParseUUIDPipe) id: string, @Query() query: ComparisonQuery, @CurrentUser() userId: string) {
    return this.comparisons.compare(id, query.baselineId, userId);
  }

  @Get('analyses/:id/report')
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() userId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const report = await this.exports.export(id, userId);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="codeaudit-analysis-${id}.json"`);
    response.setHeader('Cache-Control', 'no-store');
    return report;
  }

  @Post('projects/:projectId/analyses')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('archive', {
    limits: { fileSize: IMPORT_LIMITS.archiveBytes, files: 1, fields: 1, parts: 2, fieldSize: 10 },
  }))
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() userId: string,
    @Body() options: AnalysisOptions,
    @UploadedFile() archive?: Express.Multer.File,
  ) { return this.analyses.create(projectId, archive?.buffer, userId, options); }

  @Get('analyses/:id/context')
  context(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.analyses.context(id, userId); }

  @Delete('analyses/:id/context')
  @HttpCode(204)
  async deleteContext(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { await this.analyses.deleteContext(id, userId); }

  @Get('projects/:projectId/analyses')
  history(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: HistoryQuery, @CurrentUser() userId: string) {
    return this.analyses.history(projectId, query, userId);
  }

  @Get('analyses/:id')
  status(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.analyses.status(id, userId); }

  @Get('analyses/:id/results')
  results(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.analyses.results(id, userId); }
}
