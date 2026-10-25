import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, HttpException, type ExceptionFilter, Logger } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import type { ApiError } from '@codeaudit/contracts';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Une erreur interne est survenue.';
    let details: string[] | undefined;
    if (error instanceof HttpException) {
      statusCode = error.getStatus();
      code = ({ 400: 'VALIDATION_ERROR', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'TOO_MANY_REQUESTS', 503: 'DATABASE_UNAVAILABLE' } as Record<number, string>)[statusCode] ?? 'HTTP_ERROR';
      const body = error.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const response = body as { message?: string | string[]; code?: string };
        if (Array.isArray(response.message)) {
          details = response.message;
          message = 'Les données transmises sont invalides.';
        } else if (typeof response.message === 'string') message = response.message;
        if (response.code) code = response.code;
      }
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        statusCode = 404; code = 'PROJECT_NOT_FOUND'; message = 'Projet introuvable.';
      } else if (error.code === 'P2003' || error.code === 'P2002') {
        statusCode = 409; code = 'INTEGRITY_CONFLICT'; message = 'Cette opération entre en conflit avec les données existantes.';
      } else if (['P1000', 'P1001', 'P1002', 'P1017', 'P2024'].includes(error.code)) {
        statusCode = 503; code = 'DATABASE_UNAVAILABLE'; message = 'La base de données est indisponible. Réessayez.';
      }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      statusCode = 503; code = 'DATABASE_UNAVAILABLE'; message = 'La base de données est indisponible. Réessayez.';
    }
    const requestId = randomUUID();
    if (statusCode === 500) this.logger.error(`Erreur interne ; requête ${requestId}`);
    const response = host.switchToHttp().getResponse<{
      status(status: number): { json(body: ApiError): void };
      setHeader(name: string, value: string): void;
    }>();
    response.setHeader('X-Request-Id', requestId);
    response.status(statusCode).json({ statusCode, code, message, ...(details ? { details } : {}), requestId });
  }
}
