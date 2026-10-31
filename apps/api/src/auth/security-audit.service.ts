import { Injectable } from '@nestjs/common';
import type { Prisma } from '@codeaudit/database';
import { PrismaService } from '../database/prisma.service';
export type SecurityEventType = 'REGISTERED' | 'LOGIN_SUCCEEDED' | 'LOGIN_FAILED' | 'LOGOUT' | 'SESSION_REVOKED' | 'ALL_SESSIONS_REVOKED' | 'PASSWORD_RESET_REQUESTED' | 'PASSWORD_RESET' | 'PROFILE_UPDATED' | 'EMAIL_VERIFICATION_SENT' | 'EMAIL_VERIFIED' | 'EMAIL_CHANGE_REQUESTED' | 'EMAIL_CHANGED' | 'PASSWORD_CHANGED' | 'MFA_SETUP_STARTED' | 'MFA_ENABLED' | 'MFA_DISABLED' | 'MFA_RECOVERY_USED' | 'OAUTH_LINKED' | 'OAUTH_UNLINKED' | 'OAUTH_LOGIN_SUCCEEDED' | 'DATA_EXPORTED';
export const securitySince = () => new Date(Date.now() - 90 * 86400000);
@Injectable()
export class SecurityAuditService {
  constructor(private readonly database: PrismaService) {}
  async record(userId: string, type: SecurityEventType, extra: { provider?: string; sessionId?: string } = {}, client: Prisma.TransactionClient = this.database.client) {
    await client.securityEvent.deleteMany({ where: { userId, createdAt: { lt: securitySince() } } });
    await client.securityEvent.create({ data: { userId, type, ...extra } });
  }
}
