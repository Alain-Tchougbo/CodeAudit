import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { DashboardController } from './dashboard.controller';
import { ReportExportService } from './report-export.service';
import { ComparisonService } from './comparison.service';

@Module({ imports: [DatabaseModule], controllers: [AnalysesController, DashboardController], providers: [AnalysesService, ReportExportService, ComparisonService] })
export class AnalysesModule {}
