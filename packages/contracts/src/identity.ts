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

/** One audit-log row — `GET /identity/v1/audit-events`. */
export const auditEventSchema = z.object({
  id: z.string(),
  actorAccountId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  correlationId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
