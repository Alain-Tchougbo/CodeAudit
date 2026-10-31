import { Prisma } from '@codeaudit/database';
/** adapter-pg can surface a commit failure directly, without a Prisma P2034 wrapper. */
export function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2034';
  return error instanceof Error && error.name === 'DriverAdapterError' && typeof error.cause === 'object'
    && error.cause !== null && 'kind' in error.cause && error.cause.kind === 'TransactionWriteConflict';
}
