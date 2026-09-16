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
import { PasswordResetService } from './password-reset.service.js';
import type { MailService } from './mail.service.js';

const hasDb = Boolean(process.env['DATABASE_URL']);

const env = {
  NODE_ENV: 'test',
  JWT_ISSUER: 'https://shopnetic.test',
  JWT_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_DAYS: 30,
  AUTH_STAFF_REFRESH_TTL_HOURS: 8,
  TOTP_ISSUER: 'Shopnetic',
  TOTP_WINDOW_STEPS: 1,
  ADMIN_WEB_URL: 'http://localhost:3002',
  ADMIN_BASE_PATH: 'x7f2k9t3m1qp',
  PASSWORD_BREACH_CHECK: false,
  PASSWORD_RESET_TTL_HOURS: 1,
} as ApiEnv;

describe.skipIf(!hasDb)('staff plane (integration)', () => {
  let prisma: PrismaClient;
  let invites: StaffInviteService;
  let staffAuth: StaffAuthService;
  let inviterId: string;
  let accountId = '';
  let inviteToken = '';
  let resetToken = '';
  let recoveryCodes: string[] = [];
  const stamp = Date.now();
  const staffEmail = `itest-staff-${stamp}@shopnetic.test`;
  let staffPassword = 'staff-pass-1234-abcd';
  let totpSecret = '';
  const extraInviteEmails: string[] = [];

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
      sendStaffPasswordReset: (_to: string, url: string): Promise<void> => {
        resetToken = new URL(url).searchParams.get('token') ?? '';
        return Promise.resolve();
      },
    } as Pick<MailService, 'sendStaffInvite' | 'sendStaffPasswordReset'> as MailService;
    const passwordReset = new PasswordResetService(px, env);

    invites = new StaffInviteService(px, env, passwords, capturingMail, audit);
    staffAuth = new StaffAuthService(
      px,
      env,
      passwords,
      totp,
      sessions,
      accessTokens,
      audit,
      capturingMail,
      passwordReset,
    );

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
    const emails = [staffEmail, `itest-inviter-${stamp}@shopnetic.test`, ...extraInviteEmails];
    const ids = (await prisma.account.findMany({ where: { email: { in: emails } } })).map(
      (a) => a.id,
    );
    await prisma.recoveryCode.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.totpSecret.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.emailVerification.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.session.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.grant.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.staffInvite.deleteMany({
      where: { email: { in: [staffEmail, ...extraInviteEmails] } },
    });
    await prisma.credential.deleteMany({ where: { accountId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorAccountId: { in: ids } } });
    await prisma.account.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('creates an invite and accepts it into a staff account', async () => {
    await invites.create({ email: staffEmail, role: 'ADMIN' }, inviterId);
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]+$/);

    ({ accountId } = await invites.accept({ token: inviteToken, password: staffPassword }));
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { grants: { include: { role: true } } },
    });
    expect(account.plane).toBe('staff');
    expect(account.emailVerifiedAt).not.toBeNull();
    expect(account.grants[0]?.role.key).toBe('ADMIN');
  });

  it('rejects re-accepting the same invite — a real invite, just already accepted, distinct from unknown', async () => {
    await expect(
      invites.accept({ token: inviteToken, password: staffPassword }),
    ).rejects.toMatchObject({ code: 'INVITE_ALREADY_ACCEPTED' });
  });

  it('rejects an unknown invite token', async () => {
    await expect(
      invites.accept({ token: 'not-a-real-invite-token', password: 'irrelevant-pass-1234' }),
    ).rejects.toMatchObject({ code: 'INVITE_INVALID' });
  });

  describe('peek — the mount-time status check, read-only', () => {
    it('resolves for a live invite without consuming it — a real accept still works after', async () => {
      const email = `itest-invite-peek-${stamp}@shopnetic.test`;
      extraInviteEmails.push(email);
      await invites.create({ email, role: 'ADMIN' }, inviterId);
      const token = inviteToken;

      await expect(invites.peek(token)).resolves.toBeUndefined();

      // still usable — peeking didn't burn it
      await expect(
        invites.accept({ token, password: 'peeked-then-used-pass-1234' }),
      ).resolves.toMatchObject({ accountId: expect.any(String) });
    });

    it('rejects an unknown token, same code the real accept would', async () => {
      await expect(invites.peek('not-a-real-invite-token')).rejects.toMatchObject({
        code: 'INVITE_INVALID',
      });
    });

    it('reports already-accepted once the invite has actually been accepted', async () => {
      const email = `itest-invite-peek2-${stamp}@shopnetic.test`;
      extraInviteEmails.push(email);
      await invites.create({ email, role: 'ADMIN' }, inviterId);
      const token = inviteToken;
      await invites.accept({ token, password: 'peeked2-then-used-pass-5678' });

      await expect(invites.peek(token)).rejects.toMatchObject({ code: 'INVITE_ALREADY_ACCEPTED' });
    });
  });

  it('two near-simultaneous accepts of the same invite: exactly one wins, the other loses the race cleanly, and only one account is created', async () => {
    const email = `itest-invite-race-${stamp}@shopnetic.test`;
    extraInviteEmails.push(email);
    await invites.create({ email, role: 'ADMIN' }, inviterId);
    const token = inviteToken;

    const results = await Promise.allSettled([
      invites.accept({ token, password: 'invite-race-a-pass-1234' }),
      invites.accept({ token, password: 'invite-race-b-pass-5678' }),
    ]);

    const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilledCount).toBe(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'INVITE_ALREADY_ACCEPTED' });

    // not two accounts, despite two accept() calls racing on the same token
    const accountsForEmail = await prisma.account.findMany({ where: { email } });
    expect(accountsForEmail).toHaveLength(1);
  });

  it('first login returns a TOTP enrolment challenge (no session yet)', async () => {
    const outcome = await staffAuth.login({ email: staffEmail, password: staffPassword }, {});
    expect(outcome.kind).toBe('enrolment');
    if (outcome.kind !== 'enrolment') throw new Error('expected enrolment');
    expect(outcome.challenge.otpauthUri).toContain('otpauth://totp/');
    totpSecret = outcome.challenge.secret;
  });

  it('a second login attempt before confirming reuses the same secret, not a new one', async () => {
    // a login page reload / double-click / retry before enrolment is
    // confirmed used to mint a *new* secret each time, silently invalidating
    // whatever the user had just scanned into their authenticator app.
    const outcome = await staffAuth.login({ email: staffEmail, password: staffPassword }, {});
    expect(outcome.kind).toBe('enrolment');
    if (outcome.kind !== 'enrolment') throw new Error('expected enrolment');
    expect(outcome.challenge.secret).toBe(totpSecret);
  });

  it('confirming enrolment issues a session + recovery codes', async () => {
    const { response } = await staffAuth.confirmEnrolment(
      { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
      {},
    );
    expect(response.tokens.tokenType).toBe('Bearer');
    expect(response.user.email).toBe(staffEmail);
    expect(response.user.roles).toEqual(['ADMIN']); // the role the invite granted
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

  describe('change password', () => {
    it('rejects a wrong current password, leaves the credential untouched', async () => {
      await expect(
        staffAuth.changePassword(accountId, 'not-the-real-password', 'new-pass-5678-efgh', {}),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      // the old password still works — nothing got overwritten
      const stillGood = await staffAuth.login(
        { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
        {},
      );
      expect(stillGood.kind).toBe('session');
    });

    it('changes the password — the old one stops working, the new one logs in', async () => {
      const newPassword = 'new-pass-5678-efgh';
      await staffAuth.changePassword(accountId, staffPassword, newPassword, {});

      await expect(
        staffAuth.login(
          { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
          {},
        ),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      const outcome = await staffAuth.login(
        { email: staffEmail, password: newPassword, code: authenticator.generate(totpSecret) },
        {},
      );
      expect(outcome.kind).toBe('session');
      staffPassword = newPassword; // so any later test in this file uses the current password
    });

    it('revokes every session on the account, the one that issued the request included', async () => {
      const before = await prisma.session.findMany({ where: { accountId, revokedAt: null } });
      expect(before.length).toBeGreaterThan(0); // the login just above issued one

      await staffAuth.changePassword(accountId, staffPassword, 'yet-another-pass-9012', {});
      staffPassword = 'yet-another-pass-9012';

      const after = await prisma.session.findMany({ where: { accountId, revokedAt: null } });
      expect(after).toHaveLength(0);
    });
  });

  describe('forgot / reset password', () => {
    it('is silent (no email, no throw) for an email that has no staff account — enumeration-safe', async () => {
      await expect(
        staffAuth.forgotPassword(`nobody-${stamp}@shopnetic.test`),
      ).resolves.toBeUndefined();
      expect(resetToken).toBe(''); // no mail was ever sent
    });

    it('issues a reset token and emails it for a real staff account', async () => {
      await staffAuth.forgotPassword(staffEmail);
      expect(resetToken).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects an unknown token', async () => {
      await expect(
        staffAuth.resetPassword('not-a-real-token', 'irrelevant-pass-1234'),
      ).rejects.toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
    });

    describe('checkResetToken — the mount-time status check, read-only', () => {
      it('resolves for a live token without consuming it — a real resetPassword still works after', async () => {
        await staffAuth.forgotPassword(staffEmail);
        const token = resetToken;

        await expect(staffAuth.checkResetToken(token)).resolves.toBeUndefined();

        // still usable — peeking didn't burn it
        const newPassword = 'peeked-then-used-pass-1234';
        await expect(staffAuth.resetPassword(token, newPassword)).resolves.toBeUndefined();
        staffPassword = newPassword;
      });

      it('rejects an unknown token, same code the real reset would', async () => {
        await expect(staffAuth.checkResetToken('not-a-real-token')).rejects.toMatchObject({
          code: 'PASSWORD_RESET_TOKEN_INVALID',
        });
      });

      it('reports already-used once the token has actually been consumed', async () => {
        await staffAuth.forgotPassword(staffEmail);
        const token = resetToken;
        await staffAuth.resetPassword(token, 'checked-after-use-pass-5678');
        staffPassword = 'checked-after-use-pass-5678';

        await expect(staffAuth.checkResetToken(token)).rejects.toMatchObject({
          code: 'PASSWORD_RESET_TOKEN_ALREADY_USED',
        });
      });
    });

    it('resets the password, revokes every session, and the token cannot be reused', async () => {
      await staffAuth.forgotPassword(staffEmail);
      const token = resetToken;
      const newPassword = 'reset-flow-pass-3456';

      await staffAuth.resetPassword(token, newPassword);
      staffPassword = newPassword;

      const login = await staffAuth.login(
        {
          email: staffEmail,
          password: newPassword,
          code: authenticator.generate(totpSecret),
        },
        {},
      );
      expect(login.kind).toBe('session');

      const sessions = await prisma.session.findMany({
        where: { accountId, revokedAt: null },
      });
      // only the one login just above — reset revoked everything before it
      expect(sessions).toHaveLength(1);

      // a real token, just already spent — distinct from "unknown" above
      await expect(staffAuth.resetPassword(token, 'another-pass-7890')).rejects.toMatchObject({
        code: 'PASSWORD_RESET_TOKEN_ALREADY_USED',
      });
    });

    it('two near-simultaneous uses of the same token: exactly one wins, the other loses the race cleanly', async () => {
      await staffAuth.forgotPassword(staffEmail);
      const token = resetToken;
      const candidatePasswords = ['race-candidate-a-1234', 'race-candidate-b-5678'];

      const results = await Promise.allSettled(
        candidatePasswords.map((p) => staffAuth.resetPassword(token, p)),
      );

      const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilledCount).toBe(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({ code: 'PASSWORD_RESET_TOKEN_ALREADY_USED' });

      // whichever of the two actually won the atomic claim is the real
      // password now — find it by index rather than assuming an order,
      // since which one wins is exactly the race this test exists to check
      const winningIndex = results.findIndex((r) => r.status === 'fulfilled');
      staffPassword = candidatePasswords[winningIndex]!;
      const login = await staffAuth.login(
        { email: staffEmail, password: staffPassword, code: authenticator.generate(totpSecret) },
        {},
      );
      expect(login.kind).toBe('session');
    });

    it('using one reset link invalidates sibling links from earlier "forgot password" requests', async () => {
      await staffAuth.forgotPassword(staffEmail);
      const firstToken = resetToken;
      await staffAuth.forgotPassword(staffEmail);
      const secondToken = resetToken;
      expect(secondToken).not.toBe(firstToken);

      const newPassword = 'sibling-invalidation-pass-1234';
      await staffAuth.resetPassword(secondToken, newPassword);
      staffPassword = newPassword;

      // never used directly, but a sibling of the one that was
      await expect(staffAuth.resetPassword(firstToken, 'whatever-pass-5678')).rejects.toMatchObject(
        { code: 'PASSWORD_RESET_TOKEN_ALREADY_USED' },
      );
    });
  });
});
