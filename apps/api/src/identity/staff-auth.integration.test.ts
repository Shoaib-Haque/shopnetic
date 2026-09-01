import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import { getPrismaClient, type PrismaClient } from '@shopnetic/db';
import type { ApiEnv } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { JwksService } from '../crypto/jwks.service.js';
import { SecretBoxService } from '../crypto/secret-box.service.js';
import { PasswordService } from './password.service.js';
import { TotpService } from './totp.service.js';
import { SessionService } from './session.service.js';
import { AccessTokenService } from './access-token.service.js';
import { StaffInviteService } from './staff-invite.service.js';
import { StaffAuthService } from './staff-auth.service.js';
import type { MailService } from './mail.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

const env = {
  NODE_ENV: 'test',
  JWT_ISSUER: 'https://shopnetic.test',
  JWT_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_DAYS: 30,
  AUTH_STAFF_REFRESH_TTL_HOURS: 8,
  TOTP_ISSUER: 'Shopnetic',
  ADMIN_WEB_URL: 'http://localhost:3002',
  ADMIN_BASE_PATH: 'x7f2k9t3m1qp',
  PASSWORD_BREACH_CHECK: false,
} as ApiEnv;

describe.skipIf(!hasDb)('staff plane (integration)', () => {
  let prisma: PrismaClient;
  let invites: StaffInviteService;
  let staffAuth: StaffAuthService;
  let inviterId: string;
  let inviteToken = '';
  let recoveryCodes: string[] = [];
  const stamp = Date.now();
  const staffEmail = `itest-staff-${stamp}@shopnetic.test`;
  const staffPassword = 'staff-pass-1234-abcd';
  let totpSecret = '';

  beforeAll(async () => {
    prisma = getPrismaClient();
    const px = prisma as PrismaService;

    const jwks = new JwksService(env);
    await jwks.onModuleInit();
    const audit = new AuditService(px);
    const passwords = new PasswordService(env);
    const totp = new TotpService(px, new SecretBoxService(env), env);
    const sessions = new SessionService(px, env, audit);
    const accessTokens = new AccessTokenService(env, jwks);

    const capturingMail = {
      sendStaffInvite: (_to: string, url: string): Promise<void> => {
        inviteToken = new URL(url).searchParams.get('token') ?? '';
        return Promise.resolve();
      },
    } as Pick<MailService, 'sendStaffInvite'> as MailService;

    invites = new StaffInviteService(px, env, passwords, capturingMail, audit);
    staffAuth = new StaffAuthService(px, env, passwords, totp, sessions, accessTokens, audit);

    const superRole = await prisma.role.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
    const inviter = await prisma.account.create({
      data: {
        email: `itest-inviter-${stamp}@shopnetic.test`,
        plane: 'staff',
        status: 'active',
        emailVerifiedAt: new Date(),
        grants: { create: { roleId: superRole.id, scopeType: 'global', scopeId: null } },
      },
    });
    inviterId = inviter.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const emails = [staffEmail, `itest-inviter-${stamp}@shopnetic.test`];
    const ids = (await prisma.account.findMany({ where: { email: { in: emails } } })).map(
      (a) => a.id,
    );
    await prisma.recoveryCode.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.totpSecret.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.session.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.grant.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.staffInvite.deleteMany({ where: { email: staffEmail } });
    await prisma.credential.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('creates an invite and accepts it into a staff account', async () => {
    await invites.create({ email: staffEmail, role: 'ADMIN' }, inviterId);
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]+$/);

    const { accountId } = await invites.accept({ token: inviteToken, password: staffPassword });
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { grants: { include: { role: true } } },
    });
    expect(account.plane).toBe('staff');
    expect(account.emailVerifiedAt).not.toBeNull();
    expect(account.grants[0]?.role.key).toBe('ADMIN');
  });

  it('rejects re-accepting the same invite', async () => {
    await expect(
      invites.accept({ token: inviteToken, password: staffPassword }),
    ).rejects.toMatchObject({ code: 'INVITE_INVALID' });
  });

  it('first login returns a TOTP enrolment challenge (no session yet)', async () => {
    const outcome = await staffAuth.login({ email: staffEmail, password: staffPassword }, {});
    expect(outcome.kind).toBe('enrolment');
    if (outcome.kind !== 'enrolment') throw new Error('expected enrolment');
    expect(outcome.challenge.otpauthUri).toContain('otpauth://totp/');
    totpSecret = outcome.challenge.secret;
  });

  it('confirming enrolment issues a session + recovery codes', async () => {
    const { response } = await staffAuth.confirmEnrolment(
      { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
      {},
    );
    expect(response.tokens.tokenType).toBe('Bearer');
    expect(response.user.email).toBe(staffEmail);
    expect(response.recoveryCodes).toHaveLength(10);
    recoveryCodes = response.recoveryCodes;
  });

  it('subsequent login needs a valid code; wrong code → MFA_INVALID', async () => {
    await expect(
      staffAuth.login({ email: staffEmail, password: staffPassword }, {}),
    ).rejects.toMatchObject({ code: 'MFA_REQUIRED' });

    await expect(
      staffAuth.login({ email: staffEmail, password: staffPassword, code: '000000' }, {}),
    ).rejects.toMatchObject({ code: 'MFA_INVALID' });

    const good = await staffAuth.login(
      { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
      {},
    );
    expect(good.kind).toBe('session');
  });

  it('a recovery code works exactly once', async () => {
    const code = recoveryCodes[0]!;
    const first = await staffAuth.login({ email: staffEmail, password: staffPassword, code }, {});
    expect(first.kind).toBe('session');

    await expect(
      staffAuth.login({ email: staffEmail, password: staffPassword, code }, {}),
    ).rejects.toMatchObject({ code: 'MFA_INVALID' });
  });

  it('wrong password never leaks whether the staff account exists', async () => {
    await expect(
      staffAuth.login({ email: staffEmail, password: 'wrong-password' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      staffAuth.login({ email: `nobody-${stamp}@shopnetic.test`, password: 'whatever12' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});
