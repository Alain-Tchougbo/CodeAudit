import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
export class CredentialsDto {
  @IsString() @Length(12, 128) currentPassword!: string;
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @Matches(/^(?:\d{6}|[a-f0-9]{8}(?:-[a-f0-9]{8}){3})$/) code?: string;
}
export class EditProfileDto { @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(1, 120) name!: string; }
export class ChangePasswordDto extends CredentialsDto { @IsString() @Length(12, 128) @Matches(/\S/u) password!: string; }
export class ChangeEmailDto extends CredentialsDto { @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string; }
export class VerificationDto { @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string; }
export class MfaConfirmDto { @IsString() @Matches(/^\d{6}$/) code!: string; }
export class DeleteAccountDto extends CredentialsDto { @IsIn(['SUPPRIMER']) confirmation!: 'SUPPRIMER'; }
export class EventsQuery { @IsOptional() @IsUUID() cursor?: string; }
export class OAuthCallbackDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) state!: string;
  @ValidateIf((object: OAuthCallbackDto) => object.error === undefined) @IsString() @Length(1, 512) code?: string;
  @IsOptional() @IsString() @MaxLength(120) error?: string;
  @IsOptional() @IsString() @MaxLength(500) error_description?: string;
  @IsOptional() @IsString() @MaxLength(2048) error_uri?: string;
}
export class OAuthMfaDto { @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @Matches(/^(?:\d{6}|[a-f0-9]{8}(?:-[a-f0-9]{8}){3})$/) code!: string; }
