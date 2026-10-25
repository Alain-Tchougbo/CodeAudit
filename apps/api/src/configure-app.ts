import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpErrorFilter } from './http-error.filter';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }));
  app.useGlobalFilters(new HttpErrorFilter());
}
