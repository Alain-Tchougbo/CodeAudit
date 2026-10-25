import { Controller, Get, Module } from '@nestjs/common';
import type { HealthResponse } from '@codeaudit/contracts';
import { ProjectsModule } from './projects/projects.module';
import { AnalysesModule } from './analyses/analyses.module';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'codeaudit-api' };
  }
}

@Module({ imports: [ProjectsModule, AnalysesModule], controllers: [HealthController] })
export class AppModule {}
