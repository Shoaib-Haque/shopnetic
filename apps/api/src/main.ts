import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createLogger } from '@shopnetic/observability';
import { AppModule } from './app.module.js';
import { authRelaxed, loadApiEnv, rateLimitDisabled, responseDelayActive } from './config/env.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { devResponseDelay } from './common/dev-response-delay.middleware.js';

const log = createLogger({ service: 'api' });

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  if (authRelaxed(env)) {
    log.warn('DEV_AUTH_RELAXED is ON — staff TOTP and buyer email-verify gates are bypassed');
  }
  if (rateLimitDisabled(env)) {
    log.warn('DEV_RATE_LIMIT_DISABLED is ON — every @RateLimit guard is bypassed');
  }
  if (responseDelayActive(env)) {
    log.warn(
      { ms: env.DEV_RESPONSE_DELAY_MS, routes: env.DEV_RESPONSE_DELAY_ROUTES || '*' },
      'DEV_RESPONSE_DELAY_MS is ON — matching responses are artificially delayed',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.set('trust proxy', 1);
  app.use(cookieParser());
  // Wired only in development — the x-debug-delay header override has no
  // effect at all outside this branch, even if a client sends it elsewhere.
  if (env.NODE_ENV === 'development') {
    app.use(devResponseDelay(env));
  }
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  log.info({ port: env.PORT }, 'api listening');
}

bootstrap().catch((err: unknown) => {
  log.error({ err }, 'api failed to start');
  process.exit(1);
});
