import 'server-only';
import { z } from 'zod';

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().default('Bearer'),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

const tokenEnvelopeSchema = z.object({
  data: z.object({
    tokens: authTokensSchema,
  }),
});

/** Pull `data.tokens` out of a login or refresh response using Zod parsing at the boundary. */
export function readTokens(body: unknown): AuthTokens | null {
  const result = tokenEnvelopeSchema.safeParse(body);
  if (!result.success) {
    return null;
  }
  return result.data.data.tokens;
}
