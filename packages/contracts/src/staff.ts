import { z } from 'zod';
import { emailSchema, passwordSchema, authTokensSchema, sessionUserSchema } from './auth.js';

/**
 * Staff-plane contracts (plan/03 section 1). Invite-only; tokens carry `aud=admin`;
 * TOTP is mandatory.
 */

export const staffRoleSchema = z.enum(['SERVICE_ADMIN', 'ADMIN', 'SUPER_ADMIN']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const accountStatusSchema = z.enum(['active', 'locked', 'disabled', 'anonymized']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z-]{6,14}$/, 'enter your 6-digit code or a recovery code');

export const staffLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  /** Omitted on the first step; required once enrolled. */
  code: totpCodeSchema.optional(),
});
export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;

export const staffTotpConfirmRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  code: totpCodeSchema,
});
export type StaffTotpConfirmRequest = z.infer<typeof staffTotpConfirmRequestSchema>;

export const staffInviteCreateRequestSchema = z.object({
  email: emailSchema,
  role: staffRoleSchema,
});
export type StaffInviteCreateRequest = z.infer<typeof staffInviteCreateRequestSchema>;

export const staffInviteAcceptRequestSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});
export type StaffInviteAcceptRequest = z.infer<typeof staffInviteAcceptRequestSchema>;

/** Self-service — the caller changes their own password, proven by supplying
 * the current one; no admin action can do this for someone else. */
export const staffChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type StaffChangePasswordRequest = z.infer<typeof staffChangePasswordRequestSchema>;

/** Enumeration-safe: always 202, whether or not the email exists (plan/16). */
export const staffForgotPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type StaffForgotPasswordRequest = z.infer<typeof staffForgotPasswordRequestSchema>;

export const staffResetPasswordRequestSchema = z.object({
  token: z.string().min(10).max(200),
  newPassword: passwordSchema,
});
export type StaffResetPasswordRequest = z.infer<typeof staffResetPasswordRequestSchema>;

/** Returned when a staff account still needs to set up an authenticator app. */
export const totpEnrolmentChallengeSchema = z.object({
  status: z.literal('totp_enrolment_required'),
  /** base32 secret for manual entry */
  secret: z.string(),
  /** otpauth:// URI for the QR code */
  otpauthUri: z.string(),
});
export type TotpEnrolmentChallenge = z.infer<typeof totpEnrolmentChallengeSchema>;

export const staffSessionResponseSchema = z.object({
  tokens: authTokensSchema,
  user: sessionUserSchema,
});
export type StaffSessionResponse = z.infer<typeof staffSessionResponseSchema>;

/** First-time confirm also hands back one-time recovery codes. */
export const totpConfirmResponseSchema = staffSessionResponseSchema.extend({
  recoveryCodes: z.array(z.string()),
});
export type TotpConfirmResponse = z.infer<typeof totpConfirmResponseSchema>;

/**
 * The staff directory (`staff:manage`, Super Admin only — plan/03 section 2).
 * One row per staff account; `roles` mirrors `SessionUser.roles`' shape.
 */
export const staffAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: accountStatusSchema,
  roles: z.array(staffRoleSchema),
  totpEnrolled: z.boolean(),
  createdAt: z.string(),
});
export type StaffAccount = z.infer<typeof staffAccountSchema>;

export const staffListResponseSchema = z.object({
  accounts: z.array(staffAccountSchema),
  nextCursor: z.string().optional(),
});
export type StaffListResponse = z.infer<typeof staffListResponseSchema>;

export const staffRoleChangeRequestSchema = z.object({
  role: staffRoleSchema,
});
export type StaffRoleChangeRequest = z.infer<typeof staffRoleChangeRequestSchema>;
