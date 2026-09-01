import { Global, Module } from '@nestjs/common';
import { ActorService } from '../identity/actor.service.js';
import { AuthGuard } from './auth.guard.js';
import { StaffAuthGuard } from './staff-auth.guard.js';
import { PermissionGuard } from './permission.guard.js';

/**
 * RBAC enforcement primitives. `@Global` so any feature module can
 * `@UseGuards(AuthGuard, PermissionGuard)` without re-importing.
 */
@Global()
@Module({
  providers: [ActorService, AuthGuard, StaffAuthGuard, PermissionGuard],
  exports: [ActorService, AuthGuard, StaffAuthGuard, PermissionGuard],
})
export class AuthModule {}
