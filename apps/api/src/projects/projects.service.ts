import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { projectAccessInclude, projectAdminScope, projectPermissions, projectReadScope, projectWriteScope, requireProjectAccess } from '../access/project-access';

type AccessibleProject = Prisma.ProjectGetPayload<{ include: ReturnType<typeof projectAccessInclude> }>;
const present = (project: AccessibleProject, userId: string): Project => ({
  team: project.team ? { id: project.team.id, name: project.team.name } : null,
  permissions: projectPermissions(project, userId),
  id: project.id,
  name: project.name,
  description: project.description,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
});

@Injectable()
export class ProjectsService {
  constructor(private readonly database: PrismaService) {}

  async create(input: CreateProjectRequest, ownerId: string): Promise<Project> {
    return present(await this.database.client.project.create({
      data: { name: input.name, description: input.description || null, ownerId }, include: projectAccessInclude(ownerId),
    }), ownerId);
  }

  async list(ownerId: string): Promise<Project[]> {
    return (await this.database.client.project.findMany({
      where: projectReadScope(ownerId), include: projectAccessInclude(ownerId), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })).map(project => present(project, ownerId));
  }

  async get(id: string, ownerId: string): Promise<Project> {
    return present(await requireProjectAccess(this.database.client, id, ownerId), ownerId);
  }

  async update(id: string, input: UpdateProjectRequest, ownerId: string): Promise<Project> {
    if (input.name === undefined && input.description === undefined) {
      throw new BadRequestException('Renseignez au moins une information à modifier.');
    }
    await requireProjectAccess(this.database.client, id, ownerId, 'write');
    return present(await this.database.client.project.update({
      where: { id, AND: projectWriteScope(ownerId) }, include: projectAccessInclude(ownerId),
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    }), ownerId);
  }

  async delete(id: string, ownerId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.database.client.$transaction(async (transaction) => {
          await requireProjectAccess(transaction, id, ownerId, 'admin');
          const active = await transaction.analysis.count({
            where: { projectId: id, status: { in: ['QUEUED', 'RUNNING'] } },
          });
          if (active > 0) {
            throw new ConflictException({
              code: 'PROJECT_BUSY',
              message: 'Ce projet ne peut pas être supprimé tant qu’une analyse est en attente ou en cours.',
            });
          }
          await transaction.project.delete({ where: { id, AND: projectAdminScope(ownerId) } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error;
        if (attempt === 2) {
          throw new ConflictException({
            code: 'PROJECT_CONCURRENT_UPDATE',
            message: 'Le projet a été modifié simultanément. Réessayez la suppression.',
          });
        }
      }
    }
  }
}
