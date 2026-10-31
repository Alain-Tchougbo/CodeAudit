import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Project as StoredProject } from '@codeaudit/database';
import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';

const present = (project: StoredProject): Project => ({
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
      data: { name: input.name, description: input.description || null, ownerId },
    }));
  }

  async list(ownerId: string): Promise<Project[]> {
    return (await this.database.client.project.findMany({
      where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })).map(present);
  }

  async get(id: string, ownerId: string): Promise<Project> {
    const project = await this.database.client.project.findUnique({ where: { id, ownerId } });
    if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    return present(project);
  }

  async update(id: string, input: UpdateProjectRequest, ownerId: string): Promise<Project> {
    if (input.name === undefined && input.description === undefined) {
      throw new BadRequestException('Renseignez au moins une information à modifier.');
    }
    return present(await this.database.client.project.update({
      where: { id, ownerId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
      },
    }));
  }

  async delete(id: string, ownerId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.database.client.$transaction(async (transaction) => {
          const project = await transaction.project.findUnique({ where: { id, ownerId }, select: { id: true } });
          if (!project) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
          const active = await transaction.analysis.count({
            where: { projectId: id, status: { in: ['QUEUED', 'RUNNING'] } },
          });
          if (active > 0) {
            throw new ConflictException({
              code: 'PROJECT_BUSY',
              message: 'Ce projet ne peut pas être supprimé tant qu’une analyse est en attente ou en cours.',
            });
          }
          await transaction.project.delete({ where: { id, ownerId } });
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
