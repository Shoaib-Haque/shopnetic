import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { can, Permission, type Actor } from '@shopnetic/auth';
import type { AuditEvent } from '@shopnetic/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { clampLimit, paginate } from '../common/pagination.js';
import { ok } from '../common/envelope.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DOMAINS = ['catalog', 'identity'] as const;
type Domain = (typeof DOMAINS)[number];

/** Every `staff:manage`-gated action (`staff.controller.ts`'s invite/role/
 * activate/reset-totp/deprovision endpoints) — the slice `auditlog:read`'s
 * "partial" tier hides (plan/03 section 4). Kept as actions, not as a
 * `targetType`/`STAFF_MANAGE` check, because the audit row itself doesn't
 * record which permission gated the request that wrote it — only what
 * happened. */
const STAFF_MANAGE_ACTIONS = [
  'identity.staff_invited',
  'identity.staff_invite_accepted',
  'identity.staff_role_changed',
  'identity.staff_activated',
  'identity.staff_deprovisioned',
  'identity.staff_totp_reset',
];

interface RawAuditEvent {
  id: string;
  actor_account_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  correlation_id: string | null;
  created_at: Date;
}

/** `auditlog:read` is staff-only in practice (plan/03 section 4) — this must
 * be `StaffAuthGuard` (`aud=admin` + `plane=staff`), not the generic
 * `AuthGuard` (storefront audience only), or every real admin Bearer token
 * gets rejected as unauthenticated. */
@Controller('identity/v1')
@UseGuards(StaffAuthGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest-first, cursor-paginated, with optional filters. `id` is a v7
   * UUID so it sorts by time — filtering never changes that order (unlike
   * `CategoryService.list`'s search mode, which re-ranks by score), so
   * `cursor` stays a plain `id <` bound in every case. */
  @Get('audit-events')
  @RequirePermission(Permission.AUDITLOG_READ)
  async list(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('q') q?: string,
    @Query('domain') domainRaw?: string,
    @Query('targetType') targetType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{
    data: AuditEvent[];
    meta: { requestId: string; nextCursor?: string; count: number };
  }> {
    const limit = clampLimit(Number(limitRaw) || DEFAULT_LIMIT, 1, MAX_LIMIT);
    const domain = (DOMAINS as readonly string[]).includes(domainRaw ?? '')
      ? (domainRaw as Domain)
      : undefined;

    const params: unknown[] = [];
    const where: string[] = [];

    if (cursor) {
      params.push(cursor);
      where.push(`ae.id < $${params.length}::uuid`);
    }
    if (!can(actor, Permission.AUDITLOG_READ_FULL)) {
      const placeholders = STAFF_MANAGE_ACTIONS.map((action) => {
        params.push(action);
        return `$${params.length}`;
      });
      where.push(`ae.action NOT IN (${placeholders.join(', ')})`);
    }
    if (domain) {
      params.push(`${domain}.%`);
      where.push(`ae.action LIKE $${params.length}`);
    }
    if (targetType) {
      params.push(targetType);
      where.push(`ae.target_type = $${params.length}`);
    }
    if (from) {
      params.push(new Date(from));
      where.push(`ae.created_at >= $${params.length}`);
    }
    if (to) {
      // date-only input (`YYYY-MM-DD`) parses to that day's UTC midnight —
      // used as an exclusive upper bound one day later so the picked "to"
      // day is included in full, not cut off at its own midnight.
      params.push(new Date(new Date(to).getTime() + 24 * 3600 * 1000));
      where.push(`ae.created_at < $${params.length}`);
    }
    const tokens = q ? tokenizeForSql(q) : [];
    if (tokens.length > 0) {
      // Only predictable, known-shape columns/keys — not a general JSON
      // search (plan/16-security.md section 8 leaves deep investigation to
      // the SIEM). `after`/`before ->> 'email'` is the one JSON key worth
      // including: it's the only place a *marketplace* signup's email lives
      // (`account_registered` has no other admin lookup surface yet).
      const haystack = `lower(coalesce(acc.email, '') || ' ' || coalesce(ae.target_id, '') || ' ' ||
        ae.action || ' ' || coalesce(ae.reason, '') || ' ' ||
        coalesce(ae.after->>'email', '') || ' ' || coalesce(ae.before->>'email', ''))`;
      const matchExprs = tokens.map((tok) => {
        params.push(`%${tok}%`);
        return `(${haystack} LIKE $${params.length})`;
      });
      where.push(`(${matchExprs.join(' OR ')})`);
    }

    const rows = await this.prisma.$queryRawUnsafe<RawAuditEvent[]>(
      `SELECT ae.id, ae.actor_account_id, acc.email AS actor_email, ae.action,
              ae.target_type, ae.target_id, ae.before, ae.after, ae.reason,
              ae.ip::text AS ip, ae.correlation_id, ae.created_at
         FROM identity.audit_event ae
         LEFT JOIN identity.account acc ON acc.id = ae.actor_account_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ae.id DESC
        LIMIT ${limit + 1}`,
      ...params,
    );

    const { page, nextCursor } = paginate(rows, limit);
    return ok(req, page.map(toAuditView), {
      count: page.length,
      ...(nextCursor ? { nextCursor } : {}),
    });
  }
}

/** Mirrors `CategoryService`'s own `tokenizeForSql` (same normalize + rules,
 * matching `@/lib/search.ts`'s client-side `tokenize()`) — duplicated
 * rather than shared, following that file's own precedent of not
 * extracting this into a cross-package util. */
function tokenizeForSql(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = new Set<string>();
  for (const tok of normalized.split(' ')) {
    if (tok.length >= 2) tokens.add(tok);
    if (tokens.size >= 10) break;
  }
  return [...tokens];
}

function toAuditView(row: RawAuditEvent): AuditEvent {
  return {
    id: row.id,
    actorAccountId: row.actor_account_id,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    before: row.before,
    after: row.after,
    reason: row.reason,
    ip: row.ip,
    correlationId: row.correlation_id,
    createdAt: row.created_at.toISOString(),
  };
}
