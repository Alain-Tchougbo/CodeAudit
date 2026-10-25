import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
