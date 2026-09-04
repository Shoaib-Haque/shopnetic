import { randomUUID } from 'node:crypto';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError, ErrorCode } from '@shopnetic/contracts';
import { AppError } from './app-error.js';

const ERROR_BASE = 'https://errors.shopnetic.com/';

/**
 * Turns every thrown error into the RFC-9457 envelope (plan/08 section 4). `AppError`
 * carries its own `code`/`status`; a Nest `HttpException` is mapped by status;
 * anything else is a logged `INTERNAL` 500 with no internals leaked
 * (plan/CODING-RULES.md section F2).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = requestIdOf(req);
    const correlationId = headerValue(req, 'x-correlation-id') ?? requestId;

    const mapped = this.map(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} → ${mapped.status} ${mapped.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${mapped.status} ${mapped.code}`);
    }

    for (const [k, v] of Object.entries(mapped.headers ?? {})) res.setHeader(k, v);

    const body: ApiError = {
      error: {
        type: `${ERROR_BASE}${mapped.code.toLowerCase()}`,
        title: mapped.title,
        status: mapped.status,
        code: mapped.code,
        requestId,
        correlationId,
        ...(mapped.detail ? { detail: mapped.detail } : {}),
        ...(mapped.fields ? { errors: mapped.fields } : {}),
      },
    };

    res.status(mapped.status).json(body);
  }

  private map(exception: unknown): {
    status: number;
    code: ErrorCode;
    title: string;
    detail?: string;
    fields?: ApiError['error']['errors'];
    headers?: Record<string, string>;
  } {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        title: titleFor(exception.status),
        ...(exception.detail !== undefined ? { detail: exception.detail } : {}),
        ...(exception.fields !== undefined ? { fields: exception.fields } : {}),
        ...(exception.headers !== undefined ? { headers: exception.headers } : {}),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return { status, code: codeForStatus(status), title: titleFor(status) };
    }

    return { status: 500, code: 'INTERNAL', title: 'Internal Server Error' };
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL' : 'VALIDATION_ERROR';
  }
}

function titleFor(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return map[status] ?? 'Error';
}

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function requestIdOf(req: Request): string {
  return headerValue(req, 'x-request-id') ?? `req_${randomUUID()}`;
}
