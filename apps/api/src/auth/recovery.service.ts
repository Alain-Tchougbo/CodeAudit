import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { AuthService, digest, sessionToken } from './auth.service';
import { hashPassword } from './password';
import { MailService } from './mail.service';
import type { AuthRequest, CookieResponse } from './auth.types';

export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
}
export class ResetPasswordDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
  @IsString() @Length(12, 128) @Matches(/\S/u) password!: string;
}
const invalid = () => new BadRequestException({ code: 'RESET_TOKEN_INVALID', message: 'Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien.' });
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);
  constructor(private readonly database: PrismaService, private readonly auth: AuthService, private readonly mail: MailService) {}
  async forgot(input: ForgotPasswordDto, request: AuthRequest) {
    this.auth.checkOrigin(request); await this.auth.limit(request, 'reset', input.email); this.mail.assertConfigured();
    const user = await this.database.client.user.findUnique({ where: { email: input.email }, select: { id: true, email: true } });
    if (user) {
      const token = randomBytes(32).toString('hex'); const now = new Date();
      await this.database.client.passwordResetToken.upsert({ where: { userId: user.id }, create: { userId: user.id, tokenHash: digest(token), expiresAt: new Date(now.getTime() + 15 * 60 * 1000) }, update: { tokenHash: digest(token), createdAt: now, expiresAt: new Date(now.getTime() + 15 * 60 * 1000) } });
      try { await this.mail.reset(user.email, token); }
      catch { this.logger.warn('Envoi de récupération non abouti ; vérifiez le transport SMTP.'); }
    }
    return { message: 'Si un compte correspond à cette adresse, un lien de réinitialisation vous sera envoyé.' };
  }
  async reset(input: ResetPasswordDto, request: AuthRequest, response: CookieResponse) {
    this.auth.checkOrigin(request);
    const record = await this.database.client.passwordResetToken.findUnique({ where: { tokenHash: digest(input.token) } });
    if (!record || record.expiresAt <= new Date()) throw invalid();
    const passwordHash = await hashPassword(input.password); const cookie = sessionToken(request);
    await this.database.client.$transaction(async transaction => {
      const consumed = await transaction.passwordResetToken.deleteMany({ where: { id: record.id, tokenHash: record.tokenHash, expiresAt: { gt: new Date() } } });
      if (!consumed.count) throw invalid();
      await transaction.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await transaction.apiKey.deleteMany({ where: { userId: record.userId } });
      await transaction.session.deleteMany({ where: { OR: [{ userId: record.userId }, ...(cookie ? [{ tokenHash: digest(cookie) }] : [])] } });
    });
    this.auth.clearCookie(response);
  }
}
