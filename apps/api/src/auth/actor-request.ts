import type { Request } from 'express';
import type { Actor } from '@shopnetic/auth';

export type ActorRequest = Request & { actor?: Actor };

export function getActor(req: Request): Actor | undefined {
  return (req as ActorRequest).actor;
}

export function setActor(req: Request, actor: Actor): void {
  (req as ActorRequest).actor = actor;
}
