import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import { PrismaService } from '../database/prisma.service';
import { base32, matchTotp, SecurityCrypto } from './security-crypto';
import { SecurityAuditService } from './security-audit.service';
import { createHash } from 'node:crypto';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function invalidateCredentials(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.session.deleteMany({ where: { userId } }); await transaction.apiKey.deleteMany({ where: { userId } });
  await transaction.passwordResetToken.deleteMany({ where: { userId } }); await transaction.emailVerification.deleteMany({ where: { userId } }); await transaction.oAuthFlow.deleteMany({ where: { userId } });
  await transaction.mfaCredential.deleteMany({ where: { userId, enabledAt: null } });
}
@Injectable()
export class MfaService {
  constructor(private readonly database: PrismaService, private readonly crypto: SecurityCrypto, private readonly audit: SecurityAuditService) {}
  async verify(userId: string, code?: string, login = false) {
    const credential = await this.database.client.mfaCredential.findUnique({ where: { userId } }); if (!credential?.enabledAt) return;
    const error = () => { const body = { code: code ? 'MFA_CODE_INVALID' : 'MFA_REQUIRED', message: code ? 'Code invalide ou déjà utilisé. Attendez le prochain code ou utilisez un code de secours.' : 'Renseignez le code de votre application ou un code de secours.' }; return login ? new UnauthorizedException(body) : new ForbiddenException(body); };
    if (!code) throw error();
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/.test(code)) {
      const consumed = await this.database.client.mfaRecoveryCode.deleteMany({ where: { userId, codeHash: hash(`${userId}:${code}`) } }); if (!consumed.count) throw error(); await this.audit.record(userId, 'MFA_RECOVERY_USED'); return;
    }
    const step = matchTotp(this.crypto.open(credential.secretEncrypted, `mfa:${userId}`), code); if (step === null) throw error();
    const consumed = await this.database.client.mfaCredential.updateMany({ where: { userId, enabledAt: { not: null }, secretEncrypted: credential.secretEncrypted, lastUsedStep: { lt: BigInt(step) } }, data: { lastUsedStep: BigInt(step) } });
    if (!consumed.count) throw error();
  }
  async setup(userId: string, email: string, authVersion: number) {
    const secret = base32(randomBytes(20)); const encrypted = this.crypto.seal(secret, `mfa:${userId}`);
    try { await this.database.client.$transaction(async transaction => {
      const user = await transaction.user.findUniqueOrThrow({ where: { id: userId, authVersion } });
      if (!user.emailVerifiedAt) throw new ForbiddenException({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Vérifiez votre adresse e-mail avant d’activer la double authentification.' });
      const current = await transaction.mfaCredential.findUnique({ where: { userId } }); if (current?.enabledAt) throw new ConflictException({ code: 'MFA_ALREADY_ENABLED', message: 'La double authentification est déjà active.' });
      const data = { secretEncrypted: encrypted, pendingExpiresAt: new Date(Date.now() + 10 * 60000), lastUsedStep: BigInt(-1) };
      await transaction.mfaCredential.upsert({ where: { userId }, create: { userId, ...data }, update: data }); await this.audit.record(userId, 'MFA_SETUP_STARTED', {}, transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { this.concurrent(error); }
    return { secret, uri: `otpauth://totp/${encodeURIComponent(`CodeAudit:${email}`)}?secret=${secret}&issuer=CodeAudit&algorithm=SHA1&digits=6&period=30`, expiresInSeconds: 600 };
  }
  async enable(userId: string, code: string) {
    const credential = await this.database.client.mfaCredential.findUnique({ where: { userId } });
    if (!credential || credential.enabledAt || !credential.pendingExpiresAt || credential.pendingExpiresAt <= new Date()) throw new ConflictException({ code: 'MFA_SETUP_EXPIRED', message: 'Recommencez la configuration de la double authentification.' });
    const step = matchTotp(this.crypto.open(credential.secretEncrypted, `mfa:${userId}`), code); if (step === null) throw new ForbiddenException({ code: 'MFA_CODE_INVALID', message: 'Le code de confirmation est invalide.' });
    const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
    const authVersion = await this.database.client.$transaction(async transaction => {
      const changed = await transaction.mfaCredential.updateMany({ where: { userId, enabledAt: null, secretEncrypted: credential.secretEncrypted, pendingExpiresAt: { gt: new Date() } }, data: { enabledAt: new Date(), pendingExpiresAt: null, lastUsedStep: BigInt(step) } });
      if (!changed.count) throw new ConflictException('Configuration expirée ou déjà confirmée.');
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } }); await transaction.mfaRecoveryCode.createMany({ data: recoveryCodes.map(value => ({ userId, codeHash: hash(`${userId}:${value}`) })) });
      const updated = await transaction.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } }); await invalidateCredentials(transaction, userId); await this.audit.record(userId, 'MFA_ENABLED', {}, transaction); return updated.authVersion;
    }).catch(error => this.concurrent(error)); return { recoveryCodes, authVersion };
  }
  async disable(userId: string, authVersion: number) {
    await this.database.client.$transaction(async transaction => {
      await transaction.user.update({ where: { id: userId, authVersion }, data: { authVersion: { increment: 1 } } });
      await transaction.mfaCredential.deleteMany({ where: { userId } }); await transaction.mfaRecoveryCode.deleteMany({ where: { userId } }); await invalidateCredentials(transaction, userId); await this.audit.record(userId, 'MFA_DISABLED', {}, transaction);
    });
  }
  private concurrent(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('Modification concurrente. Réessayez.'); throw error; }
}
