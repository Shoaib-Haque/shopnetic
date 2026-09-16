import { Inject, Injectable } from '@nestjs/common';
import type { EmailVerification } from '@shopnetic/db';
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

  /** Read-only — for the frontend to check a link's status the moment the
   * page loads, before the user has typed anything. Same three outcomes as
   * `consume()`, just without consuming: a link that's already dead
   * (used/expired/unknown) should say so immediately, not wait for a form
   * submission to discover it (that's the whole page becoming a dead end
   * disguised as a working form). */
  async peek(token: string): Promise<void> {
    await this.validate(token);
  }

  /** Marks the token consumed; returns the account it was issued for.
   * "Unknown/malformed" and "already used" are distinct outcomes — the
   * latter isn't a security problem (it means an earlier submission of
   * this exact link already succeeded), so it gets its own code rather
   * than reusing `_INVALID`'s scarier copy. */
  async consume(token: string): Promise<{ accountId: string }> {
    const row = await this.validate(token);

    // Atomic claim — closes the race between the read above and this write:
    // two near-simultaneous requests for the same token could otherwise
    // both pass the `consumedAt` check above before either write commits,
    // and both proceed to reset the password. `consumedAt: null` in the
    // WHERE means only the request that actually wins the race gets
    // `count: 1`; the loser gets `count: 0` and is correctly treated as
    // already-used, because by the time its write ran, it was.
    const claimed = await this.prisma.emailVerification.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new AppError('PASSWORD_RESET_TOKEN_ALREADY_USED', 400, {
        detail: 'reset token already used (lost the race)',
      });
    }

    // Invalidate every other outstanding reset token for this account —
    // requesting "forgot password" more than once issues a separate token
    // each time; using one of the resulting links shouldn't leave the
    // others still independently valid until their own expiry.
    await this.prisma.emailVerification.updateMany({
      where: {
        accountId: row.accountId,
        purpose: 'password_reset',
        consumedAt: null,
        id: { not: row.id },
      },
      data: { consumedAt: new Date() },
    });

    return { accountId: row.accountId };
  }

  /** Shared by `peek` and `consume` — unknown/expired/already-used all
   * throw the same way for both; only `consume` goes on to actually claim
   * the token. */
  private async validate(token: string): Promise<EmailVerification> {
    const row = await this.prisma.emailVerification.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!row || row.purpose !== 'password_reset') {
      throw new AppError('PASSWORD_RESET_TOKEN_INVALID', 400, {
        detail: 'unknown reset token',
      });
    }
    if (row.consumedAt) {
      throw new AppError('PASSWORD_RESET_TOKEN_ALREADY_USED', 400, {
        detail: 'reset token already used',
      });
    }
    if (row.expiresAt <= new Date()) {
      throw new AppError('PASSWORD_RESET_TOKEN_EXPIRED', 410, { detail: 'reset token expired' });
    }
    return row;
  }
}
