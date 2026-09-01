import { pino, type Logger } from 'pino';

/**
 * Structured JSON logger — see plan/CODING-RULES.md §O and plan/18-observability.md.
 *
 * STUB: redaction list, OpenTelemetry trace/span correlation, and per-request
 * child loggers land in Phase 0 (Identity & Access) / observability wiring.
 */

const redactPaths = [
  'password',
  '*.password',
  'token',
  '*.token',
  'authorization',
  'req.headers.authorization',
  'card',
  '*.card',
  'cvv',
  '*.cvv',
];

export function createLogger(opts?: { service?: string; level?: string }): Logger {
  return pino({
    level: opts?.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: {
      service: opts?.service ?? process.env['SERVICE_NAME'] ?? 'unknown',
      env: process.env['NODE_ENV'] ?? 'development',
    },
    redact: { paths: redactPaths, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const logger = createLogger();

export type { Logger };
