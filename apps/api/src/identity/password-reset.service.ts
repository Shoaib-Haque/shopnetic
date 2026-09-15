import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

/**
 * Password-reset tokens — single-use, hashed at rest, short-lived. Reuses the
 * `email_verification` table (`purpose: password_reset`), the same mechanism
 * `VerificationService` uses for `verify_email`; kept as its own service
 * rather than folded into that one so the buyer-plane verify-email flow isn't
 * touched by staff-plane password-reset changes.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async issue(accountId: string): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.emailVerification.create({
      data: {
        accountId,
        purpose: 'password_reset',
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + this.env.PASSWORD_RESET_TTL_HOURS * 3_600_000),
      },
    });
    return token;
  }

  /** Marks the token consumed; returns the account it was issued for. */
  async consume(token: string): Promise<{ accountId: string }> {
    const row = await this.prisma.emailVerification.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!row || row.purpose !== 'password_reset' || row.consumedAt) {
      throw new AppError('PASSWORD_RESET_TOKEN_INVALID', 400, {
        detail: 'unknown or already-used reset token',
      });
    }
    if (row.expiresAt <= new Date()) {
      throw new AppError('PASSWORD_RESET_TOKEN_EXPIRED', 410, { detail: 'reset token expired' });
    }

    await this.prisma.emailVerification.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return { accountId: row.accountId };
  }
}
