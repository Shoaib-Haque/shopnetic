import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Permission } from '@shopnetic/auth';
import {
  staffChangePasswordRequestSchema,
  staffForgotPasswordRequestSchema,
  staffInviteAcceptRequestSchema,
  staffInviteCreateRequestSchema,
  staffLoginRequestSchema,
  staffResetPasswordRequestSchema,
  staffRoleChangeRequestSchema,
  staffTotpConfirmRequestSchema,
  type StaffAccount,
  type StaffChangePasswordRequest,
  type StaffForgotPasswordRequest,
  type StaffInviteAcceptRequest,
  type StaffInviteCreateRequest,
  type StaffLoginRequest,
  type StaffResetPasswordRequest,
  type StaffRoleChangeRequest,
  type StaffSession,
  type StaffSessionResponse,
  type StaffTotpConfirmRequest,
  type TotpConfirmResponse,
  type TotpEnrolmentChallenge,
} from '@shopnetic/contracts';
import type { Actor } from '@shopnetic/auth';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { ok } from '../common/envelope.js';
import { AppError } from '../common/app-error.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import { PermissionGuard } from '../auth/permission.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { CurrentActor } from '../auth/current-actor.decorator.js';
import { CurrentSessionId } from '../auth/current-session-id.decorator.js';
import { requestMeta as ctxOf } from '../common/request-meta.js';
import { StaffAuthService } from './staff-auth.service.js';
import { StaffInviteService } from './staff-invite.service.js';
import { StaffAccountsService } from './staff-accounts.service.js';
import { SessionService } from './session.service.js';
import {
  STAFF_REFRESH_COOKIE,
  clearStaffRefreshCookie,
  setStaffRefreshCookie,
} from './auth-cookie.js';

const loginBody = new ZodBodyPipe(staffLoginRequestSchema);
const confirmBody = new ZodBodyPipe(staffTotpConfirmRequestSchema);
const inviteBody = new ZodBodyPipe(staffInviteCreateRequestSchema);
const acceptBody = new ZodBodyPipe(staffInviteAcceptRequestSchema);
const roleChangeBody = new ZodBodyPipe(staffRoleChangeRequestSchema);
const changePasswordBody = new ZodBodyPipe(staffChangePasswordRequestSchema);
const forgotPasswordBody = new ZodBodyPipe(staffForgotPasswordRequestSchema);
const resetPasswordBody = new ZodBodyPipe(staffResetPasswordRequestSchema);

@Controller('identity/v1/staff')
export class StaffController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly staffAuth: StaffAuthService,
    private readonly invites: StaffInviteService,
    private readonly accounts: StaffAccountsService,
    private readonly sessions: SessionService,
  ) {}

  private get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  @Post('auth/login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:login', limit: 10, windowSeconds: 900 })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(loginBody) body: StaffLoginRequest,
  ): Promise<{
    data: StaffSessionResponse | TotpEnrolmentChallenge;
    meta: { requestId: string };
  }> {
    const outcome = await this.staffAuth.login(body, ctxOf(req));
    if (outcome.kind === 'enrolment') return ok(req, outcome.challenge);
    setStaffRefreshCookie(
      res,
      outcome.session.refreshToken,
      outcome.session.refreshExpiresAt,
      this.isProd,
    );
    return ok(req, outcome.response);
  }

  @Post('auth/totp/confirm')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:totp', limit: 10, windowSeconds: 900 })
  async confirmTotp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(confirmBody) body: StaffTotpConfirmRequest,
  ): Promise<{ data: TotpConfirmResponse; meta: { requestId: string } }> {
    const { response, session } = await this.staffAuth.confirmEnrolment(body, ctxOf(req));
    setStaffRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.isProd);
    return ok(req, response);
  }

  @Post('auth/token/refresh')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:refresh', limit: 120, windowSeconds: 3600 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { tokens: StaffSessionResponse['tokens'] }; meta: { requestId: string } }> {
    const presented = readStaffCookie(req);
    if (!presented) {
      clearStaffRefreshCookie(res, this.isProd);
      throw new AppError('REFRESH_TOKEN_INVALID', 401, { detail: 'no refresh cookie' });
    }
    try {
      const { tokens, session } = await this.staffAuth.refresh(presented, ctxOf(req));
      setStaffRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.isProd);
      return ok(req, { tokens });
    } catch (err) {
      clearStaffRefreshCookie(res, this.isProd);
      throw err;
    }
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.staffAuth.logout(readStaffCookie(req));
    clearStaffRefreshCookie(res, this.isProd);
  }

  @Post('auth/change-password')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard, RateLimitGuard)
  @RateLimit({ name: 'staff:change-password', limit: 10, windowSeconds: 900 })
  async changePassword(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(changePasswordBody) body: StaffChangePasswordRequest,
  ): Promise<void> {
    await this.staffAuth.changePassword(
      actor.accountId,
      body.currentPassword,
      body.newPassword,
      ctxOf(req),
    );
  }

  /** Self-service — every staff role, no `STAFF_MANAGE` needed: securing
   * your own account never requires the "manage other staff" permission.
   * Declared here, ahead of the `:accountId/sessions` routes further down —
   * NestJS/Express match same-shaped routes in declaration order, so `me`
   * must come first or it would be captured as an `:accountId` value. */
  @Get('me/sessions')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard)
  async mySessions(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @CurrentSessionId() sessionId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: { sessions: StaffSession[]; nextCursor?: string };
    meta: { requestId: string };
  }> {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const page = await this.sessions.listForAccount(actor.accountId, {
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
      currentSessionId: sessionId,
    });
    return ok(req, page);
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard)
  async revokeMySession(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.sessions.revokeOwnSession(actor.accountId, sessionId, ctxOf(req));
  }

  /** "Log out everywhere else" — every session but the one making this
   * request, so the caller can't lock themselves out mid-action. */
  @Post('me/sessions/revoke-others')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard)
  async revokeMyOtherSessions(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @CurrentSessionId() sessionId: string,
  ): Promise<void> {
    await this.sessions.revokeOwnOtherSessions(actor.accountId, sessionId, ctxOf(req));
  }

  @Post('auth/forgot-password')
  @HttpCode(202)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:forgot-password', limit: 5, windowSeconds: 900 })
  async forgotPassword(
    @Req() req: Request,
    @Body(forgotPasswordBody) body: StaffForgotPasswordRequest,
  ): Promise<{ data: { requested: true }; meta: { requestId: string } }> {
    await this.staffAuth.forgotPassword(body.email, ctxOf(req));
    return ok(req, { requested: true });
  }

  /** Read-only status check — the reset page calls this on load so a dead
   * link (used/expired/unknown) is obvious immediately, not only once the
   * user has filled in and submitted a form that could never have worked.
   * 200 with no meaningful body means "still good"; a dead token throws
   * the same error codes `resetPassword` below does. */
  @Get('auth/reset-password')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:reset-password-check', limit: 20, windowSeconds: 900 })
  async checkResetPassword(
    @Req() req: Request,
    @Query('token') token: string,
  ): Promise<{ data: { valid: true }; meta: { requestId: string } }> {
    await this.staffAuth.checkResetToken(token ?? '');
    return ok(req, { valid: true });
  }

  @Post('auth/reset-password')
  @HttpCode(204)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:reset-password', limit: 10, windowSeconds: 900 })
  async resetPassword(
    @Req() req: Request,
    @Body(resetPasswordBody) body: StaffResetPasswordRequest,
  ): Promise<void> {
    await this.staffAuth.resetPassword(body.token, body.newPassword, ctxOf(req));
  }

  @Get('auth/session')
  @HttpCode(200)
  async session(
    @Req() req: Request,
  ): Promise<{ data: { user: StaffSessionResponse['user'] }; meta: { requestId: string } }> {
    const user = await this.staffAuth.readSession(readStaffCookie(req));
    return ok(req, { user });
  }

  @Post('invites')
  @HttpCode(202)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async invite(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Body(inviteBody) body: StaffInviteCreateRequest,
  ): Promise<{ data: { email: string }; meta: { requestId: string } }> {
    const result = await this.invites.create(body, actor.accountId, ctxOf(req));
    return ok(req, result);
  }

  @Get('invites/accept')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:invite-accept-check', limit: 20, windowSeconds: 900 })
  async checkInvite(
    @Req() req: Request,
    @Query('token') token: string,
  ): Promise<{ data: { valid: true }; meta: { requestId: string } }> {
    await this.invites.peek(token ?? '');
    return ok(req, { valid: true });
  }

  @Post('invites/accept')
  @HttpCode(202)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: 'staff:invite-accept', limit: 10, windowSeconds: 3600 })
  async acceptInvite(
    @Req() req: Request,
    @Body(acceptBody) body: StaffInviteAcceptRequest,
  ): Promise<{ data: { accepted: true }; meta: { requestId: string } }> {
    await this.invites.accept(body, ctxOf(req));
    return ok(req, { accepted: true });
  }

  @Get()
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async list(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('q') q?: string,
  ): Promise<{
    data: { accounts: StaffAccount[]; nextCursor?: string };
    meta: { requestId: string };
  }> {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const page = await this.accounts.list(cursor, limit, q);
    return ok(req, page);
  }

  @Patch(':accountId/role')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async changeRole(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
    @Body(roleChangeBody) body: StaffRoleChangeRequest,
  ): Promise<{ data: StaffAccount; meta: { requestId: string } }> {
    const account = await this.accounts.changeRole(
      accountId,
      body.role,
      actor.accountId,
      ctxOf(req),
    );
    return ok(req, account);
  }

  @Post(':accountId/activate')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async activate(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
  ): Promise<{ data: StaffAccount; meta: { requestId: string } }> {
    const account = await this.accounts.activate(accountId, actor.accountId, ctxOf(req));
    return ok(req, account);
  }

  @Post(':accountId/reset-totp')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async resetTotp(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
  ): Promise<{ data: StaffAccount; meta: { requestId: string } }> {
    const account = await this.accounts.resetTotp(accountId, actor.accountId, ctxOf(req));
    return ok(req, account);
  }

  @Post(':accountId/deprovision')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async deprovision(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
  ): Promise<{ data: StaffAccount; meta: { requestId: string } }> {
    const account = await this.accounts.deprovision(accountId, actor.accountId, ctxOf(req));
    return ok(req, account);
  }

  /** Super Admin's "All sessions" tab — every staff account's sessions,
   * flattened. A bare literal segment (`sessions`), so it never collides
   * with the `:accountId/...` routes below regardless of declaration order
   * (different segment count). */
  @Get('sessions')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async allSessions(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: { sessions: StaffSession[]; nextCursor?: string };
    meta: { requestId: string };
  }> {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const page = await this.sessions.listAll({
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return ok(req, page);
  }

  /** Super Admin's "by person" tab, expanded — one staff member's sessions. */
  @Get(':accountId/sessions')
  @HttpCode(200)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async accountSessions(
    @Req() req: Request,
    @Param('accountId') accountId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    data: { sessions: StaffSession[]; nextCursor?: string };
    meta: { requestId: string };
  }> {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const page = await this.accounts.listSessions(accountId, {
      ...(cursor ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    return ok(req, page);
  }

  @Delete(':accountId/sessions/:sessionId')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async revokeAccountSession(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.accounts.revokeSession(accountId, sessionId, actor.accountId, ctxOf(req));
  }

  @Post(':accountId/sessions/revoke-all')
  @HttpCode(204)
  @UseGuards(StaffAuthGuard, PermissionGuard)
  @RequirePermission(Permission.STAFF_MANAGE)
  async revokeAllAccountSessions(
    @Req() req: Request,
    @CurrentActor() actor: Actor,
    @Param('accountId') accountId: string,
  ): Promise<void> {
    await this.accounts.revokeAllSessions(accountId, actor.accountId, ctxOf(req));
  }
}

function readStaffCookie(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[STAFF_REFRESH_COOKIE];
}
