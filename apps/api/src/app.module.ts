import { Controller, Get, Module } from '@nestjs/common';
import type { HealthResponse } from '@codeaudit/contracts';
import { ProjectsModule } from './projects/projects.module';
import { AnalysesModule } from './analyses/analyses.module';
import { AuthModule } from './auth/auth.module';
import { Public } from './auth/auth.types';
import { TeamsModule } from './teams/teams.module';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'codeaudit-api' };
  }
}

@Module({ imports: [AuthModule, ProjectsModule, AnalysesModule, TeamsModule], controllers: [HealthController] })
export class AppModule {}
