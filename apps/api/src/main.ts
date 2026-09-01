import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createLogger } from '@shopnetic/observability';
import { AppModule } from './app.module.js';
import { loadApiEnv } from './config/env.js';

const log = createLogger({ service: 'api' });

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  log.info({ port: env.PORT }, 'api listening');
}

bootstrap().catch((err: unknown) => {
  log.error({ err }, 'api failed to start');
  process.exit(1);
});
