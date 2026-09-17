-- Counterfeit-prone brand flag, orthogonal to `status` (plan/26 §brands).
-- Not yet consumed by anything — the listing-moderation flow that would
-- read it isn't built.
ALTER TABLE "catalog"."brand" ADD COLUMN "is_restricted" BOOLEAN NOT NULL DEFAULT false;
