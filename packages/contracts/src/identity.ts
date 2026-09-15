import { z } from 'zod';

/** Serialisable view of the authenticated actor — `GET /identity/v1/me`. */
export const grantViewSchema = z.object({
  role: z.string(),
  scopeType: z.enum(['self', 'seller', 'global']),
  scopeId: z.string().nullable(),
});
export type GrantView = z.infer<typeof grantViewSchema>;

export const actorViewSchema = z.object({
  accountId: z.string(),
  plane: z.enum(['marketplace', 'staff']),
  permissions: z.array(z.string()),
  grants: z.array(grantViewSchema),
});
export type ActorView = z.infer<typeof actorViewSchema>;

/** One audit-log row — `GET /identity/v1/audit-events`. `before`/`after` are
 * whatever JSON the writing call recorded (shape varies per `action`), shown
 * as a raw diff in the UI rather than modeled per action type. */
export const auditEventSchema = z.object({
  id: z.string(),
  actorAccountId: z.string().nullable(),
  /** null when the actor account no longer exists or the event is systemic */
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  correlationId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

/** Cursor-paginated envelope for `GET /identity/v1/audit-events`'s `meta`. */
export const auditEventsMetaSchema = z.object({
  requestId: z.string(),
  count: z.number(),
  nextCursor: z.string().optional(),
});
export type AuditEventsMeta = z.infer<typeof auditEventsMetaSchema>;
