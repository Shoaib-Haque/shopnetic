-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalog";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "ltree";

-- CreateEnum
CREATE TYPE "catalog"."CategoryBrandRequirement" AS ENUM ('required', 'optional', 'none');

-- CreateTable
CREATE TABLE "catalog"."category" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "slug" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "path" ltree,
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "brand_requirement" "catalog"."CategoryBrandRequirement" NOT NULL DEFAULT 'optional',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."outbox" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_parent_id_idx" ON "catalog"."category"("parent_id");

-- CreateIndex
CREATE INDEX "category_deleted_at_idx" ON "catalog"."category"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "category_parent_id_slug_key" ON "catalog"."category"("parent_id", "slug");

-- CreateIndex
CREATE INDEX "outbox_published_at_idx" ON "catalog"."outbox"("published_at");

-- AddForeignKey
ALTER TABLE "catalog"."category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "catalog"."category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ltree GiST index for subtree queries (path <@ ancestor, path @> descendant).
-- Hand-added: Prisma does not manage indexes on Unsupported("ltree") columns.
CREATE INDEX "category_path_gist_idx" ON "catalog"."category" USING GIST ("path");
