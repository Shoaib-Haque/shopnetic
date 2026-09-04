import type { ErrorCode } from '@shopnetic/contracts';

export interface AppErrorFieldIssue {
  field: string;
  rule: string;
  /** i18n key, not English (plan/CODING-RULES.md section L1). */
  message: string;
}

export interface AppErrorOptions {
  /** Developer-facing context. Never shown to end users (plan/CODING-RULES.md section F2). */
  detail?: string;
  fields?: AppErrorFieldIssue[];
  /** e.g. `Retry-After` seconds for a 429. */
  headers?: Record<string, string>;
  cause?: unknown;
}

/**
 * The only error type controllers/services throw for an expected failure. The
 * global filter turns it into the RFC-9457 envelope (plan/08 section 4). Anything else
 * that bubbles up becomes a generic `INTERNAL` 500.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly fields?: AppErrorFieldIssue[];
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, status: number, opts: AppErrorOptions = {}) {
    super(opts.detail ?? code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    if (opts.detail !== undefined) this.detail = opts.detail;
    if (opts.fields !== undefined) this.fields = opts.fields;
    if (opts.headers !== undefined) this.headers = opts.headers;
  }

  static unauthenticated(code: ErrorCode = 'UNAUTHENTICATED', detail?: string): AppError {
    return new AppError(code, 401, detail === undefined ? {} : { detail });
  }

  static forbidden(code: ErrorCode = 'FORBIDDEN', detail?: string): AppError {
    return new AppError(code, 403, detail === undefined ? {} : { detail });
  }

  static conflict(code: ErrorCode = 'CONFLICT', detail?: string): AppError {
    return new AppError(code, 409, detail === undefined ? {} : { detail });
  }

  static validation(fields: AppErrorFieldIssue[], detail?: string): AppError {
    return new AppError(
      'VALIDATION_ERROR',
      422,
      detail === undefined ? { fields } : { fields, detail },
    );
  }

  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError('RATE_LIMITED', 429, {
      headers: { 'Retry-After': String(retryAfterSeconds) },
      detail: `retry after ${retryAfterSeconds}s`,
    });
  }
}
