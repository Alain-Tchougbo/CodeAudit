import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../auth/auth.types';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@Body() input: CreateProjectDto, @CurrentUser() userId: string) { return this.projects.create(input, userId); }

  @Get()
  list(@CurrentUser() userId: string) { return this.projects.list(userId); }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.projects.get(id, userId); }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateProjectDto, @CurrentUser() userId: string) {
    return this.projects.update(id, input, userId);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string): Promise<void> {
    await this.projects.delete(id, userId);
  }
}
