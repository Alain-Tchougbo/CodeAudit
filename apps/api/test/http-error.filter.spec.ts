import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@codeaudit/database';
import { HttpErrorFilter } from '../src/http-error.filter';

describe('Erreurs HTTP', () => {
  function capture(error: unknown) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const host = { switchToHttp: () => ({ getResponse: () => ({ status, setHeader }) }) } as unknown as ArgumentsHost;
    new HttpErrorFilter().catch(error, host);
    return { json, status, setHeader };
  }

  it('expose les détails de validation avec un identifiant de requête', () => {
    const response = capture(new BadRequestException(['Nom invalide.']));
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'VALIDATION_ERROR', details: ['Nom invalide.'], requestId: expect.any(String),
    }));
  });

  it('convertit une mise à jour Prisma de ressource absente en 404', () => {
    const response = capture(new Prisma.PrismaClientKnownRequestError('SQL interne', {
      code: 'P2025', clientVersion: '7.10.1',
    }));
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PROJECT_NOT_FOUND' }));
  });

  it('masque les détails de connexion de la base indisponible', () => {
    const response = capture(new Prisma.PrismaClientInitializationError('password=secret', '7.10.1'));
    expect(response.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain('secret');
  });
});
