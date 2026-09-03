import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { PrismaService } from '../prisma/prisma.service.js';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';
import { SecretBoxService } from '../crypto/secret-box.service.js';
import { hashOpaqueToken } from './opaque-token.js';

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

/** TOTP (RFC 6238) + one-time recovery codes for staff MFA (plan/16 §1). */
@Injectable()
export class TotpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly box: SecretBoxService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    // Clock-skew tolerance: accept a code from ±N 30s steps (RFC 6238 §5.2).
    authenticator.options = { window: env.TOTP_WINDOW_STEPS ?? 1 };
  }

  async isEnrolled(accountId: string): Promise<boolean> {
    const row = await this.prisma.totpSecret.findUnique({ where: { accountId } });
    return row?.confirmedAt != null;
  }

  /** Start (or restart) enrolment. Fails if TOTP is already confirmed. */
  async beginEnrolment(
    accountId: string,
    accountEmail: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const existing = await this.prisma.totpSecret.findUnique({ where: { accountId } });
    if (existing?.confirmedAt != null) {
      throw new AppError('MFA_ALREADY_ENROLLED', 409, { detail: 'authenticator already set up' });
    }

    const secret = authenticator.generateSecret();
    const encrypted = this.box.encrypt(secret);
    await this.prisma.totpSecret.upsert({
      where: { accountId },
      create: { accountId, secretEncrypted: encrypted },
      update: { secretEncrypted: encrypted, confirmedAt: null },
    });

    return {
      secret,
      otpauthUri: authenticator.keyuri(accountEmail, this.env.TOTP_ISSUER, secret),
    };
  }

  /** Confirm enrolment with a code from the app; returns fresh recovery codes. */
  async confirmEnrolment(accountId: string, code: string): Promise<string[]> {
    const row = await this.prisma.totpSecret.findUnique({ where: { accountId } });
    if (!row) throw new AppError('MFA_INVALID', 400, { detail: 'no enrolment in progress' });
    if (row.confirmedAt != null) {
      throw new AppError('MFA_ALREADY_ENROLLED', 409, { detail: 'authenticator already set up' });
    }
    if (!authenticator.check(code, this.box.decrypt(row.secretEncrypted))) {
      throw new AppError('MFA_INVALID', 401, { detail: 'code did not match' });
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomRecoveryCode());
    await this.prisma.$transaction([
      this.prisma.totpSecret.update({
        where: { accountId },
        data: { confirmedAt: new Date() },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { accountId } }),
      this.prisma.recoveryCode.createMany({
        data: recoveryCodes.map((c) => ({ accountId, codeHash: hashOpaqueToken(normalise(c)) })),
      }),
    ]);
    return recoveryCodes;
  }

  /** Check a login code: a TOTP code, or (single-use) a recovery code. */
  async verifyLoginCode(accountId: string, code: string): Promise<boolean> {
    const row = await this.prisma.totpSecret.findUnique({ where: { accountId } });
    if (!row || row.confirmedAt == null) return false;

    if (authenticator.check(code, this.box.decrypt(row.secretEncrypted))) return true;

    const hash = hashOpaqueToken(normalise(code));
    const recovery = await this.prisma.recoveryCode.findFirst({
      where: { accountId, codeHash: hash, usedAt: null },
    });
    if (!recovery) return false;
    await this.prisma.recoveryCode.update({
      where: { id: recovery.id },
      data: { usedAt: new Date() },
    });
    return true;
  }
}

function randomRecoveryCode(): string {
  const pick = (): string => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]!;
  const group = (): string => Array.from({ length: 5 }, pick).join('');
  return `${group()}-${group()}`;
}

/** Recovery codes compare case-insensitively, ignoring the separator. */
function normalise(code: string): string {
  return code.toUpperCase().replace(/-/g, '');
}
