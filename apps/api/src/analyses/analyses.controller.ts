import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IMPORT_LIMITS } from '@codeaudit/analysis-jobs';
import { AnalysesService } from './analyses.service';
import { HistoryQuery } from './history.dto';
import { ReportExportService } from './report-export.service';

@Controller()
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService, private readonly exports: ReportExportService) {}

  @Get('analyses/:id/report')
  async report(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const report = await this.exports.export(id);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="codeaudit-analysis-${id}.json"`);
    response.setHeader('Cache-Control', 'no-store');
    return report;
  }

  @Post('projects/:projectId/analyses')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('archive', {
    limits: { fileSize: IMPORT_LIMITS.archiveBytes, files: 1, fields: 0, parts: 1 },
  }))
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile() archive?: Express.Multer.File,
  ) { return this.analyses.create(projectId, archive?.buffer); }

  @Get('projects/:projectId/analyses')
  history(@Param('projectId', ParseUUIDPipe) projectId: string, @Query() query: HistoryQuery) {
    return this.analyses.history(projectId, query);
  }

  @Get('analyses/:id')
  status(@Param('id', ParseUUIDPipe) id: string) { return this.analyses.status(id); }

  @Get('analyses/:id/results')
  results(@Param('id', ParseUUIDPipe) id: string) { return this.analyses.results(id); }
}
