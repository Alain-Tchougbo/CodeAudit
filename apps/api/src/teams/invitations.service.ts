import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { InvitationPreview, TeamInvitation } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../auth/mail.service';
import { AuthService } from '../auth/auth.service';
import type { AuthRequest } from '../auth/auth.types';
import type { InviteDto } from './team.dto';
import { requireTeam, teamConcurrency } from './teams.service';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const invalid = () => new BadRequestException({ code: 'INVITATION_INVALID', message: 'Cette invitation est invalide, expirée ou déjà utilisée. Demandez un nouveau lien à un administrateur.' });
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  constructor(private readonly database: PrismaService, private readonly mail: MailService, private readonly auth: AuthService) {}
  async list(teamId: string, userId: string): Promise<TeamInvitation[]> {
    await requireTeam(this.database.client, teamId, userId, true);
    return (await this.database.client.teamInvitation.findMany({ where: { teamId, expiresAt: { gt: new Date() } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })).map(row => ({ id: row.id, email: row.email, role: row.role === 'READER' ? 'READER' : 'MEMBER', createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString() }));
  }
  async create(teamId: string, input: InviteDto, userId: string, request: AuthRequest): Promise<void> {
    await requireTeam(this.database.client, teamId, userId, true); this.mail.assertConfigured(); await this.auth.limit(request, 'invite', `${teamId}:${input.email}`);
    const token = randomBytes(32).toString('hex'); const tokenHash = digest(token); let teamName: string;
    try {
      teamName = await this.database.client.$transaction(async transaction => {
        const member = await requireTeam(transaction, teamId, userId, true);
        if (await transaction.teamMember.findFirst({ where: { teamId, user: { email: input.email } } })) throw new ConflictException({ code: 'TEAM_ALREADY_MEMBER', message: 'Cette adresse correspond déjà à un membre de l’équipe.' });
        await transaction.teamInvitation.deleteMany({ where: { teamId, expiresAt: { lte: new Date() } } });
        if (!await transaction.teamInvitation.findUnique({ where: { teamId_email: { teamId, email: input.email } } }) && await transaction.teamInvitation.count({ where: { teamId } }) >= 50) throw new ConflictException({ code: 'TEAM_INVITATION_LIMIT', message: 'Cinquante invitations sont déjà en attente.' });
        const now = new Date(); const values = { role: input.role, tokenHash, invitedById: userId, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000) };
        await transaction.teamInvitation.upsert({ where: { teamId_email: { teamId, email: input.email } }, create: { teamId, email: input.email, ...values }, update: values }); return member.team.name;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { teamConcurrency(error); }
    try { await this.mail.invite(input.email, token, teamName); }
    catch {
      await this.database.client.teamInvitation.deleteMany({ where: { teamId, email: input.email, tokenHash } }); this.logger.warn('Invitation non envoyée ; vérifiez le transport SMTP.');
      throw new ServiceUnavailableException({ code: 'INVITATION_SEND_FAILED', message: 'L’invitation n’a pas pu être envoyée. Vérifiez le service e-mail puis réessayez.' });
    }
  }
  private async invitation(token: string, userId: string, transaction: Prisma.TransactionClient = this.database.client) {
    const row = await transaction.teamInvitation.findUnique({ where: { tokenHash: digest(token) }, include: { team: { select: { name: true } } } }); if (!row || row.expiresAt <= new Date()) throw invalid();
    const user = await transaction.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user || row.email !== user.email) throw new ForbiddenException({ code: 'INVITATION_EMAIL_MISMATCH', message: 'Connectez-vous avec le compte correspondant à l’adresse destinataire de cette invitation.' }); return row;
  }
  async preview(token: string, userId: string): Promise<InvitationPreview> {
    const row = await this.invitation(token, userId); if (row.role === 'ADMIN') throw invalid(); return { teamId: row.teamId, teamName: row.team.name, role: row.role, expiresAt: row.expiresAt.toISOString() };
  }
  async accept(token: string, userId: string): Promise<{ teamId: string }> {
    try {
      return await this.database.client.$transaction(async transaction => {
        const row = await this.invitation(token, userId, transaction); if (row.role === 'ADMIN') throw invalid();
        if (await transaction.teamMember.count({ where: { teamId: row.teamId } }) >= 100) throw new ConflictException({ code: 'TEAM_MEMBER_LIMIT', message: 'Cette équipe a atteint la limite de cent membres.' });
        if (await transaction.teamMember.findUnique({ where: { teamId_userId: { teamId: row.teamId, userId } } })) throw new ConflictException({ code: 'TEAM_ALREADY_MEMBER', message: 'Vous êtes déjà membre de cette équipe.' });
        const consumed = await transaction.teamInvitation.deleteMany({ where: { id: row.id, tokenHash: row.tokenHash, expiresAt: { gt: new Date() } } }); if (!consumed.count) throw invalid();
        await transaction.teamMember.create({ data: { teamId: row.teamId, userId, role: row.role } }); return { teamId: row.teamId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { teamConcurrency(error); }
  }
  async revoke(teamId: string, id: string, userId: string): Promise<void> {
    await this.database.client.$transaction(async transaction => {
      await requireTeam(transaction, teamId, userId, true); const removed = await transaction.teamInvitation.deleteMany({ where: { id, teamId } }); if (!removed.count) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation introuvable.' });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
