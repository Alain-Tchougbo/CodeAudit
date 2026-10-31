import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { ANALYSIS_PROFILE_VERSION, PROFILE_VERSIONS, getAnalysisProfile } from '@codeaudit/analyzer';
import type { ProjectRuleProfile } from '@codeaudit/contracts';
import { CurrentUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

class SelectProfileDto {
  @IsString() @IsIn(PROFILE_VERSIONS) version!: string;
}
@Controller('projects/:id/rule-profile')
export class RuleProfilesController {
  constructor(private readonly database: PrismaService) {}
  @Get()
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() ownerId: string): Promise<ProjectRuleProfile> {
    const project = await this.database.client.project.findUnique({ where: { id, ownerId }, select: { analysisProfileVersion: true } });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    return { selectedVersion: project.analysisProfileVersion, profiles: PROFILE_VERSIONS.map(version => ({
      version, name: version === ANALYSIS_PROFILE_VERSION ? 'Essentiel' : 'Strict',
      description: version === ANALYSIS_PROFILE_VERSION ? 'Profil historique : erreurs de fiabilité et avertissements de qualité.' : 'Console, variables inutilisées et any deviennent des erreurs ; complexité > 10 et profondeur > 4 signalées.',
      rules: getAnalysisProfile(version).rules,
    })) };
  }
  @Put()
  async select(@Param('id', ParseUUIDPipe) id: string, @Body() input: SelectProfileDto, @CurrentUser() ownerId: string) {
    const updated = await this.database.client.project.updateMany({ where: { id, ownerId }, data: { analysisProfileVersion: input.version } });
    if (!updated.count) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    return this.get(id, ownerId);
  }
}
