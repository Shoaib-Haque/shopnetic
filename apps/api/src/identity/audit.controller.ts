import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@shopnetic/auth';
import type { AuditEvent } from '@shopnetic/contracts';
import type { AuditEvent as AuditEventRow } from '@shopnetic/db';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Controller('identity/v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest-first, cursor-paginated. `id` is a v7 UUID so it sorts by time. */
  @Get('audit-events')
  @RequirePermission(Permission.AUDITLOG_READ)
  async list(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: AuditEvent[];
    meta: { requestId: string; nextCursor?: string; count: number };
  }> {
    const limit = clamp(Number(limitRaw) || DEFAULT_LIMIT, 1, MAX_LIMIT);
    const rows = await this.prisma.auditEvent.findMany({
      take: limit + 1,
      orderBy: { id: 'desc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page.at(-1)?.id : undefined;
    const requestId = headerValue(req, 'x-request-id') ?? 'unknown';

    return {
      data: page.map(toAuditView),
      meta: { requestId, count: page.length, ...(nextCursor ? { nextCursor } : {}) },
    };
  }
}

function toAuditView(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actorAccountId: row.actorAccountId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
    ip: row.ip,
    correlationId: row.correlationId,
    createdAt: row.createdAt.toISOString(),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}
