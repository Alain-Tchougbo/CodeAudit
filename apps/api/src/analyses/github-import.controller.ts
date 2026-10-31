import { BadRequestException, Body, Controller, HttpCode, HttpException, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateBy, ValidateIf } from 'class-validator';
import type { GitImportRequest } from '@codeaudit/contracts';
import { CurrentUser } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AnalysesService } from './analyses.service';
import { GitHubArchiveService } from './github-archive.service';
import { GITHUB_REPOSITORY, validGitReference } from './git-source';
export class GitImportDto implements GitImportRequest {
  @IsString() @MaxLength(140) @Matches(GITHUB_REPOSITORY) repository!: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(200)
  @ValidateBy({ name: 'gitReference', validator: { validate: (value: unknown) => typeof value === 'string' && validGitReference(value), defaultMessage: () => 'La référence Git doit être non vide et ne pas contenir d’espaces ou de caractères de contrôle.' } }) ref?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsInt() @Min(1) @Max(2147483647) pullRequest?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() captureContext?: boolean;
}
@Controller('projects/:projectId/analyses/github')
export class GitHubImportController {
  private activeDownloads = 0;
  constructor(private readonly database: PrismaService, private readonly github: GitHubArchiveService, private readonly analyses: AnalysesService) {}
  @Post() @HttpCode(202)
  async create(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() input: GitImportDto, @CurrentUser() ownerId: string) {
    if (!await this.database.client.project.findUnique({ where: { id: projectId, ownerId }, select: { id: true } })) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    if (input.ref !== undefined && input.pullRequest !== undefined) throw new BadRequestException('Choisissez une référence ou une pull request.');
    if (this.activeDownloads >= 2) throw new HttpException({ code: 'GIT_IMPORT_BUSY', message: 'Deux téléchargements Git sont déjà en cours. Réessayez.' }, 429);
    this.activeDownloads++;
    try { const { archive, source } = await this.github.download(input); return await this.analyses.create(projectId, archive, ownerId, { captureContext: input.captureContext, gitSource: source, stripSingleRoot: true }); }
    finally { this.activeDownloads--; }
  }
}
