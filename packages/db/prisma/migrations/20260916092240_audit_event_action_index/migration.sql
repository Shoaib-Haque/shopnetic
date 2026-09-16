-- CreateIndex
CREATE INDEX "audit_event_action_idx" ON "identity"."audit_event"("action");

-- `schema.prisma` has no way to declare a GIST index (@@index has no method
-- option without the `extendedIndexes` preview feature, not enabled here),
-- so this raw-SQL index from an earlier migration is invisible to Prisma's
-- diffing — `prisma migrate dev` treats it as drift and drops it on *any*
-- future migration, not just this one. Re-created here so this migration is
-- a net no-op for it instead of a silent regression; the underlying gap
-- (every future migration will want to drop it again) is unfixed and
-- flagged separately.
CREATE INDEX IF NOT EXISTS "category_path_gist_idx" ON "catalog"."category" USING GIST ("path");
