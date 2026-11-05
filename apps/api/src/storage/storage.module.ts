import { Inject, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import cors from 'cors';
import { StorageService } from './storage.service.js';
import { StorageController } from './storage.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { buildCorsOriginMatcher } from '../common/cors.js';

@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule implements NestModule {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  configure(consumer: MiddlewareConsumer): void {
    const corsMiddleware = cors({
      origin: buildCorsOriginMatcher(this.env),
      methods: ['PUT', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'x-correlation-id',
        'x-debug-delay',
        'x-debug-fault',
        'x-debug-body',
      ],
      maxAge: 86400,
      credentials: false,
    });

    consumer.apply(corsMiddleware).forRoutes('admin/v1/storage/upload');
  }
}
