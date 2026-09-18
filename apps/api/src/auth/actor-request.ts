import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';

export type ActorRequest = Request & { actor?: Actor; sessionId?: string };

export function getActor(req: Request): Actor | undefined {
  return (req as ActorRequest).actor;
}

export function setActor(req: Request, actor: Actor): void {
  (req as ActorRequest).actor = actor;
}

/** The session (`identity.session` row id) backing the access token on this
 * request — not part of `Actor` itself, since that's a cross-plane contract
 * type (`@shopnetic/auth`) and this is staff-session-specific (only
 * `StaffAuthGuard` sets it today). Used to mark "this is your current
 * device" in a session list, and to exclude it from a self-service "log out
 * everywhere else" bulk revoke. */
export function getSessionId(req: Request): string | undefined {
  return (req as ActorRequest).sessionId;
}

export function setSessionId(req: Request, sessionId: string): void {
  (req as ActorRequest).sessionId = sessionId;
}
