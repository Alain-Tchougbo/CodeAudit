import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, type ApiKey } from '@codeaudit/database';
import type { ApiKeyCreated, ApiKeySummary, AuthProfile } from '@codeaudit/contracts';
import { PrismaService } from '../database/prisma.service';
import { sessionToken } from './auth.service';
import type { AuthRequest } from './auth.types';
import { projectWriteScope, requireProjectAccess } from '../access/project-access';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const invalid = () => new UnauthorizedException({ code: 'API_KEY_INVALID', message: 'Clé d’intégration invalide, expirée ou révoquée.' });
const present = (key: ApiKey): ApiKeySummary => ({ id: key.id, projectId: key.projectId, name: key.name, createdAt: key.createdAt.toISOString(), expiresAt: key.expiresAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null });
@Injectable()
export class ApiKeyService {
  constructor(private readonly database: PrismaService) {}
  async authenticate(request: AuthRequest, allowed: boolean): Promise<AuthProfile> {
    const authorization = request.headers.authorization;
    if (!allowed || sessionToken(request) || typeof authorization !== 'string' || !/^Bearer ca_[a-f0-9]{64}$/.test(authorization)) throw invalid();
    const key = await this.database.client.apiKey.findUnique({ where: { tokenHash: hash(authorization.slice(7)) }, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } });
    if (!key || key.expiresAt <= new Date()) throw invalid();
    const project = await this.database.client.project.findUnique({ where: { id: key.projectId, AND: projectWriteScope(key.userId) }, select: { id: true } });
    if (!project) throw invalid();
    const params = request.params ?? {};
    if (params.projectId !== undefined) {
      if (!uuid.test(params.projectId) || params.projectId.toLowerCase() !== key.projectId) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Projet introuvable.' });
    } else if (!params.id || !uuid.test(params.id) || !await this.database.client.analysis.findUnique({ where: { id: params.id, projectId: key.projectId }, select: { id: true } })) {
      throw new NotFoundException({ code: 'ANALYSIS_NOT_FOUND', message: 'Analyse introuvable.' });
    }
    const touched = await this.database.client.apiKey.updateMany({ where: { id: key.id, expiresAt: { gt: new Date() } }, data: { lastUsedAt: new Date() } }); if (!touched.count) throw invalid();
    return { user: { ...key.user, createdAt: key.user.createdAt.toISOString() }, csrfToken: '', expiresAt: key.expiresAt.toISOString() };
  }
  private async project(projectId: string, userId: string) {
    await requireProjectAccess(this.database.client, projectId, userId, 'write');
  }
  async list(projectId: string, userId: string): Promise<ApiKeySummary[]> {
    await this.project(projectId, userId);
    return (await this.database.client.apiKey.findMany({ where: { projectId, userId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } })).map(present);
  }
  async create(projectId: string, userId: string, name: string, days: number): Promise<ApiKeyCreated> {
    await this.project(projectId, userId); const token = `ca_${randomBytes(32).toString('hex')}`;
    try {
      const key = await this.database.client.$transaction(async transaction => {
        await requireProjectAccess(transaction, projectId, userId, 'write');
        await transaction.apiKey.deleteMany({ where: { projectId, userId, expiresAt: { lte: new Date() } } });
        if (await transaction.apiKey.count({ where: { projectId, userId, expiresAt: { gt: new Date() } } }) >= 20) throw new ConflictException({ code: 'API_KEY_LIMIT', message: 'Vingt clés actives sont déjà présentes sur ce projet.' });
        return transaction.apiKey.create({ data: { projectId, userId, name, tokenHash: hash(token), expiresAt: new Date(Date.now() + days * 86400000) } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { key: present(key), token };
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException({ code: 'API_KEY_CONCURRENT_UPDATE', message: 'Une création simultanée a eu lieu. Réessayez.' }); throw error; }
  }
  async revoke(projectId: string, id: string, userId: string) {
    await this.project(projectId, userId); const removed = await this.database.client.apiKey.deleteMany({ where: { id, projectId, userId, project: projectWriteScope(userId) } });
    if (!removed.count) throw new NotFoundException({ code: 'API_KEY_NOT_FOUND', message: 'Clé d’intégration introuvable.' });
  }
}
