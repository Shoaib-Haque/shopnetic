import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Ensures every request carries an `X-Correlation-Id` and `X-Request-Id`,
 * accepting an inbound correlation id and echoing both on the response so a
 * client error message can quote one id and support can find everything
 * (plan/08 §7, plan/CODING-RULES.md §O2).
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers['x-correlation-id'];
    const correlationId = (Array.isArray(inbound) ? inbound[0] : inbound) ?? `cor_${randomUUID()}`;
    const requestId = `req_${randomUUID()}`;

    req.headers['x-correlation-id'] = correlationId;
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
