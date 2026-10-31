import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from './auth.types';
import { ApiKeyService } from './api-key.service';
class CreateKeyDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(1, 80) name!: string;
  @IsInt() @Min(1) @Max(90) expiresInDays = 30;
}
@Controller('projects/:projectId/api-keys')
export class ApiKeyController {
  constructor(private readonly keys: ApiKeyService) {}
  @Get()
  list(@Param('projectId', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { return this.keys.list(id, userId); }
  @Post()
  create(@Param('projectId', ParseUUIDPipe) id: string, @CurrentUser() userId: string, @Body() input: CreateKeyDto) { return this.keys.create(id, userId, input.name, input.expiresInDays); }
  @Delete(':id') @HttpCode(204)
  async revoke(@Param('projectId', ParseUUIDPipe) projectId: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() userId: string) { await this.keys.revoke(projectId, id, userId); }
}
