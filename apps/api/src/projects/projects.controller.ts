import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@Body() input: CreateProjectDto) { return this.projects.create(input); }

  @Get()
  list() { return this.projects.list(); }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.projects.get(id); }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateProjectDto) {
    return this.projects.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.projects.delete(id);
  }
}
