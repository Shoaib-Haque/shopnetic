import { z } from 'zod';

/**
 * Auth contracts — shared by the API (validation at the boundary) and the
 * storefront (form validation + typed responses). One schema, both sides
 * (plan/CODING-RULES.md section P1). See plan/03-users-and-rbac.md, plan/16-security.md.
 */

export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).email();

/** plan/16 section 1: length ≥ 8, max 128, no composition rules. */
export const passwordSchema = z.string().min(8).max(128);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128), // don't reveal policy on login
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  token: z.string().min(10).max(200),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** Access token only — the refresh token lives in an httpOnly cookie. */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(), // seconds
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const loginResponseSchema = z.object({
  tokens: authTokensSchema,
  user: sessionUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** `register` / `resend` are deliberately uninformative (no account enumeration). */
export const registerResponseSchema = z.object({
  email: z.string(),
  verificationRequired: z.literal(true),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
