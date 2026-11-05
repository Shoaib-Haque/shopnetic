-- AlterTable
ALTER TABLE "catalog"."media_asset" ADD COLUMN "poster_candidates" text[] DEFAULT '{}'::text[];
