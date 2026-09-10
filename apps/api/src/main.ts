import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createLogger } from '@shopnetic/observability';
import { AppModule } from './app.module.js';
import {
  authRelaxed,
  faultInjectActive,
  loadApiEnv,
  rateLimitDisabled,
  responseDelayActive,
} from './config/env.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { devResponseDelay } from './common/dev-response-delay.middleware.js';
import { devFaultInject } from './common/dev-fault-inject.middleware.js';

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
  if (faultInjectActive(env)) {
    log.warn(
      {
        status: env.DEV_FAULT_STATUS,
        routes: env.DEV_FAULT_ROUTES || '*',
        body: env.DEV_FAULT_BODY,
      },
      'DEV_FAULT_STATUS is ON — matching requests get a synthetic error response',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.set('trust proxy', 1);
  // Baseline security headers (X-Content-Type-Options, frame-ancestors,
  // HSTS, X-Powered-By removed, …). A JSON-only API never serves HTML, so
  // helmet's default CSP is inert here but harmless to send. plan/16-security.md.
  app.use(helmet());
  app.use(cookieParser());
  // Wired only in development — the x-debug-delay / x-debug-fault header
  // overrides have no effect at all outside this branch, even if a client
  // sends them elsewhere. Delay runs first so a slow-then-fail composes.
  if (env.NODE_ENV === 'development') {
    app.use(devResponseDelay(env));
    app.use(devFaultInject(env));
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
