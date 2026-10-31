import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, type PrismaClient, type TeamRole } from '@codeaudit/database';
import type { ProjectPermissions } from '@codeaudit/contracts';

export function projectReadScope(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId } } } }] };
}
export function projectWriteScope(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId, role: { in: ['ADMIN', 'MEMBER'] } } } } }] };
}
export function projectAdminScope(userId: string): Prisma.ProjectWhereInput {
  return { OR: [{ ownerId: userId, teamId: null }, { team: { members: { some: { userId, role: 'ADMIN' } } } }] };
}
export function projectAccessInclude(userId: string) {
  return { team: { select: { id: true, name: true, members: { where: { userId }, select: { userId: true, role: true } } } } } as const;
}
type AccessRecord = { ownerId: string | null; teamId: string | null; team?: { id: string; name: string; members: { userId: string; role: TeamRole }[] } | null };
const missing = () => new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
export function projectPermissions(project: AccessRecord, userId: string): ProjectPermissions {
  if (project.teamId === null) { if (project.ownerId !== userId) throw missing(); return { write: true, admin: true }; }
  const role = project.team?.members.find(member => member.userId === userId)?.role;
  if (!role) throw missing(); return { write: role !== 'READER', admin: role === 'ADMIN' };
}
export async function requireProjectAccess(client: PrismaClient | Prisma.TransactionClient, id: string, userId: string, mode: 'read' | 'write' | 'admin' = 'read') {
  const project = await client.project.findUnique({ where: { id, AND: projectReadScope(userId) }, include: projectAccessInclude(userId) });
  if (!project) throw missing(); const permissions = projectPermissions(project, userId);
  if (mode === 'write' && !permissions.write) throw new ForbiddenException({ code: 'PROJECT_READ_ONLY', message: 'Ce projet est accessible en lecture seule.' });
  if (mode === 'admin' && !permissions.admin) throw new ForbiddenException({ code: 'PROJECT_ADMIN_REQUIRED', message: 'Cette action nécessite le rôle administrateur de l’équipe.' });
  return project;
}
export function readableProjectsSql(userId: string): Prisma.Sql {
  return Prisma.sql`SELECT project.id FROM "Project" project WHERE
    (project."teamId" IS NULL AND project."ownerId" = ${userId}::uuid)
    OR EXISTS (SELECT 1 FROM "TeamMember" member WHERE member."teamId" = project."teamId" AND member."userId" = ${userId}::uuid)`;
}
