import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { API_ENV, type ApiEnv } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/**
 * Symmetric encryption for secrets kept in the DB (TOTP seeds, payout account
 * refs, …) — plan/16 §7. AES-256-GCM; the ciphertext string is
 * `v1.<iv>.<tag>.<data>` (all base64url).
 *
 * Key comes from `TOTP_ENC_KEY` (32 bytes, base64). In non-production a fixed
 * key is derived from a constant so dev data stays readable across restarts.
 */
@Injectable()
export class SecretBoxService {
  private readonly logger = new Logger(SecretBoxService.name);
  private readonly key: Buffer;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    if (env.TOTP_ENC_KEY) {
      const raw = Buffer.from(env.TOTP_ENC_KEY, 'base64');
      if (raw.length !== 32) throw new Error('TOTP_ENC_KEY must be 32 bytes (base64)');
      this.key = raw;
    } else {
      if (env.NODE_ENV === 'production') throw new Error('TOTP_ENC_KEY is required in production');
      this.key = createHash('sha256').update('shopnetic-dev-secret-box').digest();
      this.logger.warn('no TOTP_ENC_KEY set — using a fixed dev key');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', b64(iv), b64(tag), b64(data)].join('.');
  }

  decrypt(ciphertext: string): string {
    const [version, ivB64, tagB64, dataB64] = ciphertext.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('malformed ciphertext');
    }
    const decipher = createDecipheriv(ALGO, this.key, ub64(ivB64));
    decipher.setAuthTag(ub64(tagB64));
    return Buffer.concat([decipher.update(ub64(dataB64)), decipher.final()]).toString('utf8');
  }
}

function b64(buf: Buffer): string {
  return buf.toString('base64url');
}
function ub64(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}
