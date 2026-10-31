import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { RuleProfilesController } from './rule-profiles.controller';

@Module({ imports: [DatabaseModule], controllers: [ProjectsController, RuleProfilesController], providers: [ProjectsService] })
export class ProjectsModule {}
