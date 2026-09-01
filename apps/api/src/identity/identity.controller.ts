import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  loginRequestSchema,
  registerRequestSchema,
  resendVerificationRequestSchema,
  verifyEmailRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResendVerificationRequest,
  type SessionUser,
  type VerifyEmailRequest,
} from '@shopnetic/contracts';
import { API_ENV, type ApiEnv } from '../config/env.js';
import { ok } from '../common/envelope.js';
import { AppError } from '../common/app-error.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { RateLimit } from '../common/rate-limit.decorator.js';
import { IdentityService } from './identity.service.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './auth-cookie.js';

const registerBody = new ZodBodyPipe(registerRequestSchema);
const loginBody = new ZodBodyPipe(loginRequestSchema);
const verifyBody = new ZodBodyPipe(verifyEmailRequestSchema);
const resendBody = new ZodBodyPipe(resendVerificationRequestSchema);

@Controller('identity/v1/auth')
@UseGuards(RateLimitGuard)
export class IdentityController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly identity: IdentityService,
  ) {}

  private get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  @Post('register')
  @HttpCode(202)
  @RateLimit({ name: 'auth:register', limit: 10, windowSeconds: 3600 })
  async register(
    @Req() req: Request,
    @Body(registerBody) body: RegisterRequest,
  ): Promise<{ data: RegisterResponse; meta: { requestId: string } }> {
    const result = await this.identity.register(body, requestMeta(req));
    return ok(req, result);
  }

  @Post('verify')
  @HttpCode(200)
  @RateLimit({ name: 'auth:verify', limit: 20, windowSeconds: 3600 })
  async verify(
    @Req() req: Request,
    @Body(verifyBody) body: VerifyEmailRequest,
  ): Promise<{ data: { verified: true }; meta: { requestId: string } }> {
    const result = await this.identity.verifyEmail(body, requestMeta(req));
    return ok(req, result);
  }

  @Post('verification/resend')
  @HttpCode(202)
  @RateLimit({ name: 'auth:resend', limit: 5, windowSeconds: 3600 })
  async resend(
    @Req() req: Request,
    @Body(resendBody) body: ResendVerificationRequest,
  ): Promise<{ data: { ok: true }; meta: { requestId: string } }> {
    const result = await this.identity.resendVerification(body);
    return ok(req, result);
  }

  @Post('login')
  @HttpCode(200)
  @RateLimit({ name: 'auth:login', limit: 10, windowSeconds: 900 })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(loginBody) body: LoginRequest,
  ): Promise<{ data: LoginResponse; meta: { requestId: string } }> {
    const { tokens, user, session } = await this.identity.login(body, sessionContext(req));
    setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.isProd);
    return ok(req, { tokens, user });
  }

  @Post('token/refresh')
  @HttpCode(200)
  @RateLimit({ name: 'auth:refresh', limit: 60, windowSeconds: 3600 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { tokens: LoginResponse['tokens'] }; meta: { requestId: string } }> {
    const presented = readRefreshCookie(req);
    if (!presented) {
      clearRefreshCookie(res, this.isProd);
      throw new AppError('REFRESH_TOKEN_INVALID', 401, { detail: 'no refresh cookie' });
    }
    try {
      const { tokens, session } = await this.identity.refresh(presented, sessionContext(req));
      setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt, this.isProd);
      return ok(req, { tokens });
    } catch (err) {
      clearRefreshCookie(res, this.isProd);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.identity.logout(readRefreshCookie(req));
    clearRefreshCookie(res, this.isProd);
  }

  /** Current user for a valid refresh cookie. No rotation. 401 if not signed in. */
  @Get('session')
  @HttpCode(200)
  async session(
    @Req() req: Request,
  ): Promise<{ data: { user: SessionUser }; meta: { requestId: string } }> {
    const user = await this.identity.readSession(readRefreshCookie(req));
    return ok(req, { user });
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const jar = (req as Request & { cookies?: Record<string, string> }).cookies;
  return jar?.[REFRESH_COOKIE];
}

function sessionContext(req: Request): {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
} {
  const ua = req.headers['user-agent'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof ua === 'string' ? { userAgent: ua } : {}),
    ...requestMeta(req),
  };
}

function requestMeta(req: Request): { ip?: string; correlationId?: string } {
  const cid = req.headers['x-correlation-id'];
  return {
    ...(req.ip ? { ip: req.ip } : {}),
    ...(typeof cid === 'string' ? { correlationId: cid } : {}),
  };
}
