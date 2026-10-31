import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { DashboardController } from './dashboard.controller';
import { ReportExportService } from './report-export.service';
import { ComparisonService } from './comparison.service';
import { GitHubArchiveService } from './github-archive.service';
import { GitHubImportController } from './github-import.controller';

@Module({ imports: [DatabaseModule], controllers: [AnalysesController, DashboardController, GitHubImportController], providers: [AnalysesService, ReportExportService, ComparisonService, GitHubArchiveService] })
export class AnalysesModule {}
