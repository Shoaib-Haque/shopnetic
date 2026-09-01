import { Global, Module } from '@nestjs/common';
import { API_ENV, loadApiEnv } from './env.js';

/**
 * Provides the validated env object under the `API_ENV` token. `@Global` so
 * feature modules inject it without re-importing.
 */
@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: () => loadApiEnv() }],
  exports: [API_ENV],
})
export class ConfigModule {}
