import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  type Actor,
  type Grant,
  type Permission,
  type ScopeType,
} from '@shopnetic/auth';
import { PrismaService } from '../prisma/prisma.service.js';

const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

/**
 * Assembles the `Actor` for an account: its grants, each with the role's
 * permissions resolved from `role_permission`. One query per request (a
 * short-lived cache can be added later).
 */
@Injectable()
export class ActorService {
  constructor(private readonly prisma: PrismaService) {}

  async forAccount(accountId: string): Promise<Actor | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        grants: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });
    if (!account || account.status !== 'active' || account.deletedAt !== null) return null;

    const grants: Grant[] = account.grants.map((g) => ({
      role: g.role.key,
      scopeType: g.scopeType as ScopeType,
      scopeId: g.scopeId,
      permissions: g.role.permissions
        .map((rp) => rp.permission.key)
        .filter((key): key is Permission => KNOWN_PERMISSIONS.has(key)),
    }));

    return {
      accountId: account.id,
      plane: account.plane === 'staff' ? 'staff' : 'marketplace',
      grants,
    };
  }
}
