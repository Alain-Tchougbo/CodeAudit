import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, IsUUID, Length, Matches, MaxLength, ValidateBy } from 'class-validator';
import type { TeamRole } from '@codeaudit/contracts';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class TeamNameDto {
  @Transform(trim) @IsString() @Length(1, 120)
  @ValidateBy({ name: 'printableTeamName', validator: { validate: (value: unknown) => typeof value === 'string' && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127), defaultMessage: () => 'Le nom doit être sur une seule ligne, sans caractères de contrôle.' } }) name!: string;
}
export class MemberRoleDto { @IsIn(['ADMIN', 'MEMBER', 'READER']) role!: TeamRole; }
export class InviteDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string;
  @IsIn(['MEMBER', 'READER']) role!: 'MEMBER' | 'READER';
}
export class InvitationTokenDto { @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string; }
export class ShareProjectDto { @IsUUID() teamId!: string; }
