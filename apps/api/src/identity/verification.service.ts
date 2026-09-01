import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { generateOpaqueToken, hashOpaqueToken } from './opaque-token.js';

/** Email-verification tokens: single-use, hashed at rest, time-limited. */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async issue(accountId: string): Promise<string> {
    const token = generateOpaqueToken();
    await this.prisma.emailVerification.create({
      data: {
        accountId,
        purpose: 'verify_email',
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + this.env.VERIFICATION_TTL_HOURS * 3_600_000),
      },
    });
    return token;
  }

  /** Marks the account verified; returns its id. A second use of the token fails. */
  async consume(token: string): Promise<{ accountId: string }> {
    const row = await this.prisma.emailVerification.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });
    if (!row || row.purpose !== 'verify_email' || row.consumedAt) {
      throw new AppError('VERIFICATION_TOKEN_INVALID', 400, {
        detail: 'unknown or already-used token',
      });
    }
    if (row.expiresAt <= new Date()) {
      throw new AppError('VERIFICATION_TOKEN_EXPIRED', 410, {
        detail: 'verification token expired',
      });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.account.updateMany({
        where: { id: row.accountId, emailVerifiedAt: null },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    return { accountId: row.accountId };
  }
}
