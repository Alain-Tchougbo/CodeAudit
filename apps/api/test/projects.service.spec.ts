import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import { ProjectsService } from '../src/projects/projects.service';
import type { PrismaService } from '../src/database/prisma.service';

describe('Suppression de projet', () => {
  const transaction = {
    project: { findUnique: jest.fn(), delete: jest.fn() },
    analysis: { count: jest.fn() },
  };
  const runTransaction = jest.fn();
  const database = { client: { $transaction: runTransaction } } as unknown as PrismaService;
  const service = new ProjectsService(database);
  const conflict = () => new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '7.10.1' });

  beforeEach(() => {
    jest.resetAllMocks();
    transaction.project.findUnique.mockResolvedValue({ id: 'project' });
    transaction.analysis.count.mockResolvedValue(0);
    transaction.project.delete.mockResolvedValue({});
    runTransaction.mockImplementation((work: (value: typeof transaction) => Promise<void>) => work(transaction));
  });

  it('refuse une ressource absente avant toute suppression', async () => {
    transaction.project.findUnique.mockResolvedValue(null);
    await expect(service.delete('missing', 'owner')).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.project.delete).not.toHaveBeenCalled();
  });

  it('préserve un projet ayant une analyse active', async () => {
    transaction.analysis.count.mockResolvedValue(1);
    await expect(service.delete('project', 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.project.delete).not.toHaveBeenCalled();
  });

  it('supprime un projet sans analyse active en transaction sérialisable', async () => {
    await service.delete('project', 'owner');
    expect(transaction.project.delete).toHaveBeenCalledWith({ where: { id: 'project', ownerId: 'owner' } });
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('réévalue les analyses après un conflit de sérialisation', async () => {
    runTransaction.mockRejectedValueOnce(conflict());
    transaction.analysis.count.mockResolvedValue(1);
    await expect(service.delete('project', 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(runTransaction).toHaveBeenCalledTimes(2);
    expect(transaction.project.delete).not.toHaveBeenCalled();
  });

  it('borne les reprises en cas de modifications concurrentes répétées', async () => {
    runTransaction.mockRejectedValue(conflict());
    await expect(service.delete('project', 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(runTransaction).toHaveBeenCalledTimes(3);
  });
});
