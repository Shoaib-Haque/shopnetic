/**
 * Idempotent seed: permission catalog, system roles, role→permission wiring,
 * and an optional bootstrap Super Admin.
 *
 * Safe to run repeatedly. For system roles the code in `@shopnetic/auth` is the
 * source of truth — role_permission rows not in the map are removed.
 *
 * Run: `pnpm --filter @shopnetic/db db:seed`
 */
import { z } from 'zod';
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  ROLE_PERMISSIONS,
  Role,
  hashPassword,
  ARGON2_PARAMS,
} from '@shopnetic/auth';
import { createLogger } from '@shopnetic/observability';
import { getPrismaClient } from '../src/index.js';
import { loadDbEnv } from '../src/env.js';

const log = createLogger({ service: 'db-seed' });

const bootstrapSchema = z
  .object({
    BOOTSTRAP_SUPERADMIN_EMAIL: z.string().email().optional(),
    BOOTSTRAP_SUPERADMIN_PASSWORD: z.string().min(12).optional(),
  })
  .refine(
    (v) =>
      (v.BOOTSTRAP_SUPERADMIN_EMAIL && v.BOOTSTRAP_SUPERADMIN_PASSWORD) ||
      (!v.BOOTSTRAP_SUPERADMIN_EMAIL && !v.BOOTSTRAP_SUPERADMIN_PASSWORD),
    {
      message: 'Set both BOOTSTRAP_SUPERADMIN_EMAIL and BOOTSTRAP_SUPERADMIN_PASSWORD, or neither',
    },
  );

async function main(): Promise<void> {
  loadDbEnv();
  const bootstrap = bootstrapSchema.parse(process.env);
  const prisma = getPrismaClient();

  // 1. Permission catalog
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  log.info({ count: PERMISSIONS.length }, 'permissions upserted');

  // 2. System roles
  for (const key of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { key },
      create: { key, name: key, isSystem: true },
      update: { isSystem: true },
    });
  }
  log.info({ count: SYSTEM_ROLES.length }, 'system roles upserted');

  // 3. role → permission wiring (authoritative for system roles)
  const permByKey = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  for (const roleKey of SYSTEM_ROLES) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const wantKeys = ROLE_PERMISSIONS[roleKey];
    const wantIds = wantKeys.map((k) => {
      const id = permByKey.get(k);
      if (!id) throw new Error(`seed: permission "${k}" missing for role ${roleKey}`);
      return id;
    });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wantIds } },
      }),
      ...wantIds.map((permissionId) =>
        prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          create: { roleId: role.id, permissionId },
          update: {},
        }),
      ),
    ]);
    log.info({ role: roleKey, permissions: wantKeys.length }, 'role permissions synced');
  }

  // 4. Optional bootstrap Super Admin
  if (!bootstrap.BOOTSTRAP_SUPERADMIN_EMAIL || !bootstrap.BOOTSTRAP_SUPERADMIN_PASSWORD) {
    log.info('no BOOTSTRAP_SUPERADMIN_* env set — skipping bootstrap account');
  } else {
    const email = bootstrap.BOOTSTRAP_SUPERADMIN_EMAIL;
    const superRole = await prisma.role.findUniqueOrThrow({ where: { key: Role.SUPER_ADMIN } });

    const account = await prisma.account.upsert({
      where: { email },
      update: {},
      create: {
        email,
        plane: 'staff',
        status: 'active',
        emailVerifiedAt: new Date(),
        credential: {
          create: {
            passwordHash: await hashPassword(bootstrap.BOOTSTRAP_SUPERADMIN_PASSWORD),
            hashAlgo: 'argon2id',
            params: ARGON2_PARAMS,
          },
        },
      },
    });

    const existingGrant = await prisma.grant.findFirst({
      where: { accountId: account.id, roleId: superRole.id, scopeType: 'global' },
    });
    if (!existingGrant) {
      await prisma.grant.create({
        data: { accountId: account.id, roleId: superRole.id, scopeType: 'global', scopeId: null },
      });
    }
    log.info({ email, created: account.createdAt }, 'bootstrap Super Admin ensured');
  }

  log.info('seed complete');
}

main()
  .catch((err: unknown) => {
    log.error({ err }, 'seed failed');
    process.exitCode = 1;
  })
  .finally(() => {
    void getPrismaClient().$disconnect();
  });
