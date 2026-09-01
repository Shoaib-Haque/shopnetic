import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller.js';
import { MeController } from './me.controller.js';
import { AuditController } from './audit.controller.js';
import { IdentityService } from './identity.service.js';
import { PasswordService } from './password.service.js';
import { VerificationService } from './verification.service.js';
import { MailService } from './mail.service.js';
import { SessionService } from './session.service.js';
import { AccessTokenService } from './access-token.service.js';

/**
 * Identity & Access context (plan/03). Depends on the global Prisma, Redis,
 * Config, Crypto, Auth and Audit modules.
 */
@Module({
  controllers: [IdentityController, MeController, AuditController],
  providers: [
    IdentityService,
    PasswordService,
    VerificationService,
    MailService,
    SessionService,
    AccessTokenService,
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
