import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { AccountSecurityState, OAuthProvider, SecurityEventsPage } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuthService, digest } from './auth.service';
import { SecurityAuditService, securitySince } from './security-audit.service';
import { SecurityCrypto } from './security-crypto';
import { MailService } from './mail.service';
import { invalidateCredentials } from './mfa.service';
import { hashPassword } from './password';
import type { AuthRequest } from './auth.types';
import type { ChangeEmailDto, ChangePasswordDto, CredentialsDto } from './account-security.dto';
export const oauthConfigured = (provider: OAuthProvider) => !!process.env[`${provider}_CLIENT_ID`] && !!process.env[`${provider}_CLIENT_SECRET`] && new SecurityCrypto().available();
@Injectable()
export class AccountSecurityService {
  private readonly logger = new Logger(AccountSecurityService.name);
  constructor(private readonly database: PrismaService, private readonly auth: AuthService, private readonly audit: SecurityAuditService, private readonly crypto: SecurityCrypto, private readonly mail: MailService) {}
  async state(userId: string): Promise<AccountSecurityState> {
    const user = await this.database.client.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true, mfa: { select: { enabledAt: true } }, _count: { select: { recoveryCodes: true } }, identities: { select: { provider: true, login: true, createdAt: true }, orderBy: { provider: 'asc' } } } });
    return { emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null, mfa: { available: this.crypto.available(), enabled: !!user.mfa?.enabledAt, recoveryCodesRemaining: user._count.recoveryCodes }, identities: user.identities.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), providers: this.providers() };
  }
  providers() { return (['GITHUB', 'GITLAB'] as const).map(provider => ({ provider, configured: oauthConfigured(provider) })); }
  async profile(userId: string, name: string) { await this.database.client.$transaction(async transaction => { await transaction.user.update({ where: { id: userId }, data: { name } }); await this.audit.record(userId, 'PROFILE_UPDATED', {}, transaction); }); }
  async verification(userId: string, request: AuthRequest, input?: ChangeEmailDto) {
    const user = input ? await this.auth.sensitive(userId, input, request) : await this.database.client.user.findUniqueOrThrow({ where: { id: userId } });
    await this.auth.limit(request, 'verify', userId); this.mail.assertConfigured();
    const email = input?.email ?? user.email;
    if (input && email === user.email) throw new BadRequestException('Cette adresse est déjà celle de votre compte.');
    if (!input && user.emailVerifiedAt) throw new ConflictException('Cette adresse est déjà vérifiée.');
    if (input && await this.database.client.user.findUnique({ where: { email } })) throw new ConflictException({ code: 'EMAIL_ALREADY_USED', message: 'Cette adresse est déjà utilisée.' });
    const token = randomBytes(32).toString('hex'); const tokenHash = digest(token); const createdAt = new Date();
    await this.database.client.emailVerification.upsert({ where: { userId }, create: { userId, email, changeEmail: !!input, authVersion: user.authVersion, tokenHash, createdAt, expiresAt: new Date(createdAt.getTime() + 30 * 60000) }, update: { email, changeEmail: !!input, authVersion: user.authVersion, tokenHash, createdAt, expiresAt: new Date(createdAt.getTime() + 30 * 60000) } });
    try { await this.mail.verify(email, token, !!input); }
    catch { await this.database.client.emailVerification.deleteMany({ where: { userId, tokenHash } }); this.logger.warn('Confirmation e-mail non envoyée ; vérifiez le transport SMTP.'); throw new ServiceUnavailableException({ code: 'VERIFICATION_SEND_FAILED', message: 'Le message n’a pas pu être envoyé. Réessayez.' }); }
    await this.audit.record(userId, input ? 'EMAIL_CHANGE_REQUESTED' : 'EMAIL_VERIFICATION_SENT'); return { message: 'Un lien de confirmation a été envoyé à cette adresse.' };
  }
  async confirmEmail(token: string, request: AuthRequest) {
    this.auth.checkOrigin(request); await this.auth.limit(request, 'verify', digest(token));
    try { return await this.database.client.$transaction(async transaction => {
      const row = await transaction.emailVerification.findUnique({ where: { tokenHash: digest(token) } });
      if (!row || row.expiresAt <= new Date()) throw new BadRequestException({ code: 'VERIFICATION_INVALID', message: 'Lien invalide, expiré ou déjà utilisé.' });
      const user = await transaction.user.findUnique({ where: { id: row.userId, authVersion: row.authVersion } });
      if (!user || (!row.changeEmail && row.email !== user.email)) throw new BadRequestException('Ce lien n’est plus valide.');
      const consumed = await transaction.emailVerification.deleteMany({ where: { userId: row.userId, tokenHash: row.tokenHash, expiresAt: { gt: new Date() } } }); if (!consumed.count) throw new BadRequestException('Ce lien a déjà été utilisé.');
      await transaction.user.update({ where: { id: row.userId, authVersion: row.authVersion }, data: { email: row.email, emailVerifiedAt: new Date(), ...(row.changeEmail ? { authVersion: { increment: 1 } } : {}) } });
      if (row.changeEmail) await invalidateCredentials(transaction, row.userId);
      await this.audit.record(row.userId, row.changeEmail ? 'EMAIL_CHANGED' : 'EMAIL_VERIFIED', {}, transaction); return { changed: row.changeEmail };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { this.concurrent(error); }
  }
  async password(userId: string, input: ChangePasswordDto, request: AuthRequest) {
    const user = await this.auth.sensitive(userId, input, request); if (input.password === input.currentPassword) throw new BadRequestException('Choisissez un mot de passe différent.'); const passwordHash = await hashPassword(input.password);
    await this.database.client.$transaction(async transaction => {
      await transaction.user.update({ where: { id: userId, authVersion: user.authVersion }, data: { passwordHash, authVersion: { increment: 1 } } });
      await invalidateCredentials(transaction, userId); await this.audit.record(userId, 'PASSWORD_CHANGED', {}, transaction);
    });
  }
  async events(userId: string, cursor?: string): Promise<SecurityEventsPage> {
    await this.database.client.securityEvent.deleteMany({ where: { userId, createdAt: { lt: securitySince() } } });
    if (cursor && !await this.database.client.securityEvent.findFirst({ where: { userId, id: cursor }, select: { id: true } })) throw new BadRequestException('Curseur invalide.');
    const rows = await this.database.client.securityEvent.findMany({ where: { userId, createdAt: { gte: securitySince() } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 21 });
    return { items: rows.slice(0, 20).map(({ id, type, provider, sessionId, createdAt }) => ({ id, type, provider, sessionId, createdAt: createdAt.toISOString() })), nextCursor: rows.length > 20 ? rows[19]!.id : null };
  }
  async export(userId: string, input: CredentialsDto, request: AuthRequest) {
    const current = await this.auth.sensitive(userId, input, request);
    const document = await this.database.client.$transaction(async transaction => {
      const user = await transaction.user.findUniqueOrThrow({ where: { id: userId, authVersion: current.authVersion }, select: { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true } });
      const personalScope = { ownerId: userId, teamId: null };
      if (await transaction.project.count({ where: personalScope }) > 500 || await transaction.analysis.count({ where: { project: personalScope } }) > 5000) throw new PayloadTooLargeException('Cet export dépasse les limites synchrones (500 projets ou 5 000 analyses). Aucun export partiel n’a été produit.');
      // A transaction owns one connection: query sequentially, preserving its snapshot.
      const projects = await transaction.project.findMany({ where: personalScope, select: { id: true, name: true, description: true, createdAt: true, updatedAt: true, analysisProfileVersion: true, qualityPolicy: true, analyses: { select: { id: true, status: true, createdAt: true, startedAt: true, finishedAt: true, profileVersion: true, projectSnapshot: true, sourceMetadata: true, report: true, statistics: true, errorCode: true, errorMessage: true, qualityPolicySnapshot: true } } } });
      const memberships = await transaction.teamMember.findMany({ where: { userId }, select: { role: true, createdAt: true, team: { select: { id: true, name: true } } } });
      const identities = await transaction.oAuthIdentity.findMany({ where: { userId }, select: { provider: true, subject: true, login: true, createdAt: true } });
      const apiKeys = await transaction.apiKey.findMany({ where: { userId }, select: { id: true, name: true, projectId: true, createdAt: true, expiresAt: true, lastUsedAt: true } });
      const sessions = await transaction.session.findMany({ where: { userId }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true } });
      const securityEvents = await transaction.securityEvent.findMany({ where: { userId, createdAt: { gte: securitySince() } }, select: { id: true, type: true, provider: true, sessionId: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      const sharedProjects = await transaction.project.findMany({ where: { team: { members: { some: { userId } } } }, select: { id: true, name: true, teamId: true } });
      const verification = await transaction.emailVerification.findUnique({ where: { userId }, select: { email: true, changeEmail: true, createdAt: true, expiresAt: true } });
      const mfa = await transaction.mfaCredential.findUnique({ where: { userId }, select: { enabledAt: true, pendingExpiresAt: true } });
      const recoveryCodesRemaining = await transaction.mfaRecoveryCode.count({ where: { userId } });
      const pendingOAuth = await transaction.oAuthFlow.findMany({ where: { userId }, select: { provider: true, purpose: true, expiresAt: true } });
      return { schemaVersion: 1, exportedAt: new Date().toISOString(), user, projects, memberships, sharedProjects, identities, apiKeys, sessions, securityEvents, security: { verification, mfa, recoveryCodesRemaining, pendingOAuth }, exclusions: ['passwords', 'authenticationTokens', 'mfaSecretsAndRecoveryCodes', 'sourceCodeContexts', 'sharedProjectReports', 'temporarySources'] };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    const json = JSON.stringify(document); if (Buffer.byteLength(json) > 32 * 1024 * 1024) throw new PayloadTooLargeException('Cet export dépasse 32 Mio. Aucun export partiel n’a été produit.');
    await this.audit.record(userId, 'DATA_EXPORTED'); return json;
  }
  async delete(userId: string, input: CredentialsDto, request: AuthRequest) {
    const current = await this.auth.sensitive(userId, input, request);
    try { await this.database.client.$transaction(async transaction => {
      await transaction.user.findUniqueOrThrow({ where: { id: userId, authVersion: current.authVersion } });
      const memberships = await transaction.teamMember.findMany({ where: { userId }, include: { team: { include: { _count: { select: { members: true, projects: true } } } } } });
      for (const membership of memberships) {
        if (membership.role !== 'ADMIN') continue;
        const otherAdmins = await transaction.teamMember.count({ where: { teamId: membership.teamId, role: 'ADMIN', userId: { not: userId } } });
        if (!otherAdmins) {
          if (membership.team._count.members === 1 && membership.team._count.projects === 0) await transaction.team.delete({ where: { id: membership.teamId } });
          else throw new ConflictException({ code: 'LAST_TEAM_ADMIN', message: 'Nommez un autre administrateur ou supprimez explicitement les projets et l’équipe avant de supprimer le compte.' });
        }
      }
      if (await transaction.analysis.count({ where: { project: { ownerId: userId, teamId: null }, status: { in: ['QUEUED', 'RUNNING'] } } })) throw new ConflictException({ code: 'ACCOUNT_BUSY', message: 'Attendez la fin ou l’annulation des analyses personnelles avant de supprimer le compte.' });
      await transaction.project.deleteMany({ where: { ownerId: userId, teamId: null } });
      await transaction.project.updateMany({ where: { ownerId: userId, teamId: { not: null } }, data: { ownerId: null } });
      await transaction.user.delete({ where: { id: userId, authVersion: current.authVersion } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); } catch (error) { this.concurrent(error); }
  }
  private concurrent(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException({ code: 'EMAIL_ALREADY_USED', message: 'Cette adresse est déjà utilisée.' });
      if (error.code === 'P2034') throw new ConflictException({ code: 'ACCOUNT_CONCURRENT_UPDATE', message: 'Une modification simultanée a eu lieu. Actualisez puis réessayez.' });
      if (error.code === 'P2025') throw new NotFoundException('Le compte ou ses accès ont changé. Reconnectez-vous.');
    } throw error;
  }
}
