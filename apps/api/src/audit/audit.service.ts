import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuditEntry {
  /** `null` for system / pre-auth events (e.g. a failed login). */
  actorAccountId?: string | null;
  /** `context.verb_noun`, past tense — e.g. `identity.session_created`. */
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  /** Required for destructive / GDPR actions (plan/25 §2.5). */
  reason?: string;
  ip?: string;
  correlationId?: string;
}

/**
 * Append-only audit trail (plan/16 §8). Never blocks the caller's response on a
 * failure — a write error is logged, not thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorAccountId: entry.actorAccountId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          reason: entry.reason ?? null,
          ip: entry.ip ?? null,
          correlationId: entry.correlationId ?? null,
          ...(entry.before !== undefined ? { before: entry.before as Prisma.InputJsonValue } : {}),
          ...(entry.after !== undefined ? { after: entry.after as Prisma.InputJsonValue } : {}),
        },
      });
    } catch (err: unknown) {
      this.logger.error(
        `failed to write audit_event action=${entry.action}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }
}
