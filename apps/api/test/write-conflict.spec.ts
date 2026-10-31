import { Prisma } from '@codeaudit/database';
import { isWriteConflict } from '../src/database/write-conflict';
describe('Conflits de commit Prisma et adapter-pg', () => {
  it('reconnaît la forme Prisma', () => { expect(isWriteConflict(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }))).toBe(true); });
  it('reconnaît la forme directe de l’adaptateur et refuse les autres erreurs', () => {
    const error = new Error('commit conflict', { cause: { kind: 'TransactionWriteConflict' } }); error.name = 'DriverAdapterError'; expect(isWriteConflict(error)).toBe(true);
    const unrelated = new Error('private detail', { cause: { kind: 'ColumnNotFound' } }); unrelated.name = 'DriverAdapterError'; expect(isWriteConflict(unrelated)).toBe(false); expect(isWriteConflict(new Error('unexpected'))).toBe(false);
  });
});
