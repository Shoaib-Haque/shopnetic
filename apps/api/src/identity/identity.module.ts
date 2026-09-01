import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { PasswordService } from './password.service.js';
import { VerificationService } from './verification.service.js';
import { MailService } from './mail.service.js';
import { SessionService } from './session.service.js';
import { AccessTokenService } from './access-token.service.js';

/**
 * Identity & Access context (plan/03). Depends on the global Prisma, Redis,
 * Config and Crypto modules.
 */
@Module({
  controllers: [IdentityController],
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
