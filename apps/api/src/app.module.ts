import { Controller, Get, Module } from '@nestjs/common';
import type { HealthResponse } from '@codeaudit/contracts';
import { ProjectsModule } from './projects/projects.module';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { Public } from './auth/auth.types';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'codeaudit-api' };
  }
}

@Module({ imports: [AuthModule, ProjectsModule, AnalysesModule], controllers: [HealthController] })
export class AppModule {}
