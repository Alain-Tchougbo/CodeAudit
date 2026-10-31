import { RequestMethod, ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpErrorFilter } from './http-error.filter';

export function configureApp(app: INestApplication): void {
  app.use((_request: unknown, response: { setHeader(name: string, value: string): void }, next: () => void) => { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }));
  app.useGlobalFilters(new HttpErrorFilter());
}
