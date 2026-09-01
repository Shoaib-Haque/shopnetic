import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createLogger } from '@shopnetic/observability';
import { AppModule } from './app.module.js';

const log = createLogger({ service: 'api' });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableShutdownHooks();

  const port = Number(process.env['PORT'] ?? 4000);
  await app.listen(port);
  log.info({ port }, 'api listening');
}

bootstrap().catch((err: unknown) => {
  log.error({ err }, 'api failed to start');
  process.exit(1);
});
