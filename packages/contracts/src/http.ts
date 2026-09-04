import { z } from 'zod';

/**
 * Shared HTTP envelope + error shape — see plan/08-api-design.md section 4.
 * These types are the contract between every service, the BFF, and the frontend.
 */

export const requestMetaSchema = z.object({
  requestId: z.string(),
  nextCursor: z.string().optional(),
  count: z.number().int().nonnegative().optional(),
});
export type RequestMeta = z.infer<typeof requestMetaSchema>;

export function successSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: requestMetaSchema });
}

export function collectionSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), meta: requestMetaSchema });
}

/** Field-level validation problem. `message` is an i18n key, not English (plan/24 section 4). */
export const fieldErrorSchema = z.object({
  field: z.string(),
  rule: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    /** stable machine code — drives client handling + i18n lookup */
    code: z.string(),
    detail: z.string().optional(),
    errors: z.array(fieldErrorSchema).optional(),
    requestId: z.string(),
    correlationId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
