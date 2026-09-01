import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Permission } from '@shopnetic/auth';
import {
  staffInviteAcceptRequestSchema,
  staffInviteCreateRequestSchema,
  staffLoginRequestSchema,
  staffTotpConfirmRequestSchema,
  type StaffInviteAcceptRequest,
  type StaffInviteCreateRequest,
  type StaffLoginRequest,
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
import { StaffAuthService } from './staff-auth.service.js';
import { StaffInviteService } from './staff-invite.service.js';
import {
  STAFF_REFRESH_COOKIE,
  clearStaffRefreshCookie,
  setStaffRefreshCookie,
} from './auth-cookie.js';

const loginBody = new ZodBodyPipe(staffLoginRequestSchema);
const confirmBody = new ZodBodyPipe(staffTotpConfirmRequestSchema);
const inviteBody = new ZodBodyPipe(staffInviteCreateRequestSchema);
const acceptBody = new ZodBodyPipe(staffInviteAcceptRequestSchema);

@Controller('identity/v1/staff')
export class StaffController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly staffAuth: StaffAuthService,
    private readonly invites: StaffInviteService,
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
}

function readStaffCookie(req: Request): string | undefined {
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[STAFF_REFRESH_COOKIE];
}

function ctxOf(req: Request): { ip?: string; userAgent?: string; correlationId?: string } {
  const ua = req.headers['user-agent'];
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof ua === 'string' ? { userAgent: ua } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}
