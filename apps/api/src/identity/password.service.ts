import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DUMMY_PASSWORD_HASH, hashPassword, needsRehash, verifyPassword } from '@shopnetic/auth';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { AppError } from '../common/app-error.js';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  verify(encodedHash: string, plain: string): Promise<boolean> {
    return verifyPassword(encodedHash, plain);
  }

  needsRehash(encodedHash: string): boolean {
    return needsRehash(encodedHash);
  }

  /** Burn the same work for an unknown account so timing doesn't leak existence. */
  async verifyDummy(plain: string): Promise<void> {
    await verifyPassword(DUMMY_PASSWORD_HASH, plain);
  }

  /**
   * k-anonymity check against the Have I Been Pwned range API (plan/16 §1).
   * Off by default; fail-open if the service is unreachable.
   */
  async assertNotBreached(plain: string): Promise<void> {
    if (!this.env.PASSWORD_BREACH_CHECK) return;

    const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    let text: string;
    try {
      const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
      });
      if (!resp.ok) return;
      text = await resp.text();
    } catch (err: unknown) {
      this.logger.warn(
        `breach check unavailable: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return;
    }

    const breached = text.split('\n').some((line) => {
      const [hashSuffix, countStr] = line.trim().split(':');
      return hashSuffix === suffix && Number(countStr) > 0;
    });
    if (breached) {
      throw new AppError('PASSWORD_BREACHED', 422, {
        detail: 'password appears in a known breach corpus',
        fields: [{ field: 'password', rule: 'breached', message: 'errors.PASSWORD_BREACHED' }],
      });
    }
  }
}
