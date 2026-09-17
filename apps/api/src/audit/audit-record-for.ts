import type { Actor } from '@shopnetic/auth';
import type { AuditService } from './audit.service.js';
import type { RequestMeta } from '../identity/identity.service.js';

export interface AuditRecordExtra {
  before?: unknown;
  after?: unknown;
  reason?: string;
}

/**
 * Binds a fixed `targetType` to `AuditService.record` — every catalog
 * service (`brand`, `product`, `option-type`, `category-option`, `variant`,
 * `media`, `product-option`) had its own byte-identical private `record`
 * method differing only in this string. `before`/`after` are typed
 * `unknown` on `AuditEntry`, so `exactOptionalPropertyTypes` allows passing
 * them through unconditionally (`unknown` already subsumes `undefined`);
 * `reason`/`ip`/`correlationId` are typed `string`, which does not, so
 * those still need the conditional spread to satisfy the stricter type.
 */
export function auditRecordFor(audit: AuditService, targetType: string) {
  return async (
    actor: Actor,
    action: string,
    targetId: string,
    meta: RequestMeta,
    extra: AuditRecordExtra = {},
  ): Promise<void> => {
    await audit.record({
      actorAccountId: actor.accountId,
      action,
      targetType,
      targetId,
      before: extra.before,
      after: extra.after,
      ...(extra.reason !== undefined ? { reason: extra.reason } : {}),
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    });
  };
}
