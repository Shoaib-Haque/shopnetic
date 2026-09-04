import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from './app-error.js';

/**
 * Validates a request body against a Zod schema at the boundary
 * (plan/CODING-RULES.md section B4/section P1). On failure throws a `VALIDATION_ERROR`
 * `AppError` whose `errors[]` messages are **i18n keys**, not English
 * (`errors.field.<rule>`), per section L1.
 */
@Injectable()
export class ZodBodyPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw AppError.validation(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        rule: issue.code,
        message: `errors.field.${issue.code}`,
      })),
      'request body failed schema validation',
    );
  }
}
