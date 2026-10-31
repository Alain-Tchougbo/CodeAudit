import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
export class LoginDto {
  @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @Matches(/^(?:\d{6}|[a-f0-9]{8}(?:-[a-f0-9]{8}){3})$/) code?: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email!: string;
  @IsString()
  @Length(12, 128, { message: 'Le mot de passe doit contenir de 12 à 128 caractères.' })
  @Matches(/\S/u, { message: 'Le mot de passe ne peut pas être composé uniquement d’espaces.' })
  password!: string;
}
export class RegisterDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(1, 120, { message: 'Le nom doit contenir de 1 à 120 caractères.' })
  name!: string;
}
