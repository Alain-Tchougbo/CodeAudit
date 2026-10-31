import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { TeamDetail, TeamRole, TeamSummary } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { projectReadScope } from '../access/project-access';
const missing = () => new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Équipe introuvable.' });
export function teamConcurrency(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002', 'P2003'].includes(error.code)) throw new ConflictException({ code: 'TEAM_CONCURRENT_UPDATE', message: 'Une modification simultanée a eu lieu. Actualisez puis réessayez.' }); throw error;
}
export async function requireTeam(client: Prisma.TransactionClient, teamId: string, userId: string, admin = false) {
  const member = await client.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } }, include: { team: true } });
  if (!member) throw missing(); if (admin && member.role !== 'ADMIN') throw new ForbiddenException({ code: 'TEAM_ADMIN_REQUIRED', message: 'Cette action nécessite le rôle administrateur de l’équipe.' }); return member;
}
@Injectable()
export class TeamsService {
  constructor(private readonly database: PrismaService) {}
  async create(name: string, userId: string): Promise<TeamDetail> {
    const team = await this.database.client.team.create({ data: { name, createdById: userId, members: { create: { userId, role: 'ADMIN' } } } }); return this.get(team.id, userId);
  }
  async list(userId: string): Promise<TeamSummary[]> {
    const teams = await this.database.client.team.findMany({ where: { members: { some: { userId } } }, include: { _count: { select: { members: true, projects: true } }, members: { where: { userId }, select: { role: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return teams.flatMap(team => team.members[0] ? [{ id: team.id, name: team.name, createdAt: team.createdAt.toISOString(), role: team.members[0].role, memberCount: team._count.members, projectCount: team._count.projects }] : []);
  }
  async get(id: string, userId: string): Promise<TeamDetail> {
    const membership = await this.database.client.teamMember.findUnique({ where: { teamId_userId: { teamId: id, userId } }, include: { team: { include: { _count: { select: { members: true, projects: true } }, members: { include: { user: { select: { name: true, email: true } } }, orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }] } } } } });
    if (!membership) throw missing(); const team = membership.team;
    return { id: team.id, name: team.name, createdAt: team.createdAt.toISOString(), role: membership.role, memberCount: team._count.members, projectCount: team._count.projects,
      members: team.members.map(member => ({ userId: member.userId, name: member.user.name, role: member.role, joinedAt: member.createdAt.toISOString(), ...(membership.role === 'ADMIN' ? { email: member.user.email } : {}) })) };
  }
  async rename(id: string, name: string, userId: string) {
    await requireTeam(this.database.client, id, userId, true);
    const changed = await this.database.client.team.updateMany({ where: { id, members: { some: { userId, role: 'ADMIN' } } }, data: { name } }); if (!changed.count) throw missing(); return this.get(id, userId);
  }
  async membership(teamId: string, targetId: string, role: TeamRole | null, actorId: string): Promise<void> {
    try {
      await this.database.client.$transaction(async transaction => {
        const actor = await requireTeam(transaction, teamId, actorId, role !== null || actorId.toLowerCase() !== targetId.toLowerCase());
        const target = await transaction.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: targetId } } }); if (!target) throw new NotFoundException({ code: 'TEAM_MEMBER_NOT_FOUND', message: 'Membre introuvable.' });
        if (target.role === role) return;
        if (target.role === 'ADMIN' && role !== 'ADMIN' && await transaction.teamMember.count({ where: { teamId, role: 'ADMIN' } }) <= 1) throw new ConflictException({ code: 'LAST_TEAM_ADMIN', message: 'L’équipe doit conserver au moins un administrateur.' });
        if (role === null) await transaction.teamMember.delete({ where: { teamId_userId: { teamId, userId: targetId } } });
        else { if (actor.role !== 'ADMIN') throw new ForbiddenException(); await transaction.teamMember.update({ where: { teamId_userId: { teamId, userId: targetId } }, data: { role } }); }
        await transaction.apiKey.deleteMany({ where: { userId: targetId, project: { teamId } } });
        await transaction.teamInvitation.deleteMany({ where: { teamId, invitedById: targetId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { teamConcurrency(error); }
  }
  async share(projectId: string, teamId: string, userId: string): Promise<void> {
    try {
      await this.database.client.$transaction(async transaction => {
        const member = await requireTeam(transaction, teamId, userId); if (member.role === 'READER') throw new ForbiddenException({ code: 'TEAM_READ_ONLY', message: 'Votre rôle ne permet pas de partager un projet dans cette équipe.' });
        const project = await transaction.project.findUnique({ where: { id: projectId, AND: projectReadScope(userId) } }); if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
        if (project.teamId?.toLowerCase() === teamId.toLowerCase()) return;
        if (project.teamId !== null) throw new ConflictException({ code: 'PROJECT_ALREADY_SHARED', message: 'Ce projet est déjà rattaché à une équipe.' });
        const changed = await transaction.project.updateMany({ where: { id: projectId, ownerId: userId, teamId: null }, data: { teamId } }); if (!changed.count) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
        await transaction.apiKey.deleteMany({ where: { projectId } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { teamConcurrency(error); }
  }
  async delete(id: string, userId: string): Promise<void> {
    try {
      await this.database.client.$transaction(async transaction => {
        await requireTeam(transaction, id, userId, true);
        if (await transaction.project.count({ where: { teamId: id } })) throw new ConflictException({ code: 'TEAM_HAS_PROJECTS', message: 'Cette équipe contient encore des projets. Leur suppression doit être explicite.' });
        await transaction.team.delete({ where: { id, members: { some: { userId, role: 'ADMIN' } } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { teamConcurrency(error); }
  }
}
