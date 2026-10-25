import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateIf } from 'class-validator';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  type CreateProjectRequest,
  type UpdateProjectRequest,
} from '@codeaudit/contracts';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProjectDto implements CreateProjectRequest {
  @Transform(trim)
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @Length(1, PROJECT_NAME_MAX_LENGTH, { message: 'Le nom doit contenir entre 1 et 120 caractères.' })
  name!: string;

  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH, { message: 'La description est limitée à 2 000 caractères.' })
  description?: string | null;
}

export class UpdateProjectDto implements UpdateProjectRequest {
  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'Le nom doit être une chaîne de caractères.' })
  @Length(1, PROJECT_NAME_MAX_LENGTH, { message: 'Le nom doit contenir entre 1 et 120 caractères.' })
  name?: string;

  @Transform(trim)
  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString({ message: 'La description doit être une chaîne de caractères.' })
  @MaxLength(PROJECT_DESCRIPTION_MAX_LENGTH, { message: 'La description est limitée à 2 000 caractères.' })
  description?: string | null;
}
