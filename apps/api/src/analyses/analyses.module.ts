import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [DatabaseModule], controllers: [AnalysesController, DashboardController], providers: [AnalysesService] })
export class AnalysesModule {}
