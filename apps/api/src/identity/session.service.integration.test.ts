import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from './session.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

describe.skipIf(!hasDb)('SessionService (integration)', () => {
  let prisma: PrismaClient;
  let sessions: SessionService;
  let accountId: string;
  let otherAccountId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = getPrismaClient();
    const px = prisma as PrismaService;
    sessions = new SessionService(px, { AUTH_REFRESH_TTL_DAYS: 30 } as never, new AuditService(px));

    const account = await prisma.account.create({
      data: { email: `itest-session-${stamp}@shopnetic.test`, plane: 'staff', status: 'active' },
    });
    accountId = account.id;
    const other = await prisma.account.create({
      data: {
        email: `itest-session-other-${stamp}@shopnetic.test`,
        plane: 'staff',
        status: 'active',
      },
    });
    otherAccountId = other.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [accountId, otherAccountId].filter(Boolean);
    await prisma.session.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("lists an account's own active sessions, marking the current one", async () => {
    const a = await sessions.create(accountId, { userAgent: 'itest-ua-a', ip: '1.1.1.1' });
    const b = await sessions.create(accountId, { userAgent: 'itest-ua-b', ip: '2.2.2.2' });

    const { sessions: list } = await sessions.listForAccount(accountId, {
      currentSessionId: a.sessionId,
    });
    const ids = list.map((s) => s.id);
    expect(ids).toContain(a.sessionId);
    expect(ids).toContain(b.sessionId);
    expect(list.find((s) => s.id === a.sessionId)?.isCurrent).toBe(true);
    expect(list.find((s) => s.id === b.sessionId)?.isCurrent).toBe(false);
  });

  it('parses the raw user agent into browser/os/deviceLabel', async () => {
    const s = await sessions.create(accountId, {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    });
    const { sessions: list } = await sessions.listForAccount(accountId);
    const row = list.find((r) => r.id === s.sessionId);
    expect(row?.browser).toBe('Chrome');
    expect(row?.os).toBe('macOS');
    expect(row?.deviceLabel).toBe('Chrome on macOS');
  });

  it('a null/missing user agent parses to "Unknown device" rather than throwing', async () => {
    const s = await sessions.create(accountId, {});
    const { sessions: list } = await sessions.listForAccount(accountId);
    const row = list.find((r) => r.id === s.sessionId);
    expect(row?.browser).toBeNull();
    expect(row?.os).toBeNull();
    expect(row?.deviceLabel).toBe('Unknown device');
  });

  it('revokeById is scoped to the given account — a session id belonging to a different account is a safe no-op', async () => {
    const mine = await sessions.create(accountId, {});
    const theirs = await sessions.create(otherAccountId, {});

    // wrong scope on purpose — accountId, not otherAccountId
    await sessions.revokeById(theirs.sessionId, accountId, 'admin');
    const theirsRow = await prisma.session.findUniqueOrThrow({ where: { id: theirs.sessionId } });
    expect(theirsRow.revokedAt).toBeNull();

    await sessions.revokeById(mine.sessionId, accountId, 'admin');
    const mineRow = await prisma.session.findUniqueOrThrow({ where: { id: mine.sessionId } });
    expect(mineRow.revokedAt).not.toBeNull();
    expect(mineRow.revokedReason).toBe('admin');
  });

  it('revokeAllForAccount with exceptSessionId revokes every other session, keeping the excepted one active', async () => {
    const keep = await sessions.create(accountId, {});
    const gone1 = await sessions.create(accountId, {});
    const gone2 = await sessions.create(accountId, {});

    await sessions.revokeAllForAccount(accountId, 'logout', keep.sessionId);

    const rows = await prisma.session.findMany({
      where: { id: { in: [keep.sessionId, gone1.sessionId, gone2.sessionId] } },
    });
    expect(rows.find((r) => r.id === keep.sessionId)?.revokedAt).toBeNull();
    expect(rows.find((r) => r.id === gone1.sessionId)?.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.id === gone2.sessionId)?.revokedAt).not.toBeNull();
  });

  it('revokeOwnSession revokes the row and writes an audit event', async () => {
    const s = await sessions.create(accountId, {});
    await sessions.revokeOwnSession(accountId, s.sessionId);

    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedReason).toBe('logout');

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'identity.staff_session_revoked', targetId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(event.after).toMatchObject({ sessionId: s.sessionId });
  });

  it('revokeOwnOtherSessions keeps only the current session and writes an audit event', async () => {
    const current = await sessions.create(accountId, {});
    const other = await sessions.create(accountId, {});

    await sessions.revokeOwnOtherSessions(accountId, current.sessionId);

    const rows = await prisma.session.findMany({
      where: { id: { in: [current.sessionId, other.sessionId] } },
    });
    expect(rows.find((r) => r.id === current.sessionId)?.revokedAt).toBeNull();
    expect(rows.find((r) => r.id === other.sessionId)?.revokedAt).not.toBeNull();

    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { action: 'identity.staff_sessions_revoked_all', targetId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    expect(event.after).toMatchObject({ exceptCurrent: true });
  });

  it('listAll spans multiple accounts (staff plane only)', async () => {
    const mine = await sessions.create(accountId, {});
    const other = await sessions.create(otherAccountId, {});

    const { sessions: list } = await sessions.listAll({ limit: 100 });
    const ids = list.map((s) => s.id);
    expect(ids).toContain(mine.sessionId);
    expect(ids).toContain(other.sessionId);
  });

  it('listForAccount paginates with a cursor, never repeating a row', async () => {
    const created = [
      await sessions.create(accountId, {}),
      await sessions.create(accountId, {}),
      await sessions.create(accountId, {}),
    ];

    const seen = new Set<string>();
    let cursor: string | undefined;
    let guard = 0;
    do {
      const page = await sessions.listForAccount(accountId, {
        ...(cursor ? { cursor } : {}),
        limit: 2,
      });
      for (const s of page.sessions) {
        expect(seen.has(s.id)).toBe(false);
        seen.add(s.id);
      }
      cursor = page.nextCursor;
      guard += 1;
    } while (cursor && guard < 20);

    for (const c of created) expect(seen.has(c.sessionId)).toBe(true);
  });
});
