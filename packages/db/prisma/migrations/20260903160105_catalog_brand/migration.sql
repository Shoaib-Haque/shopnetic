-- CreateEnum
CREATE TYPE "catalog"."BrandStatus" AS ENUM ('pending', 'active', 'rejected');


-- CreateTable
CREATE TABLE "catalog"."brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name_i18n" JSONB,
    "logo_key" TEXT,
    "status" "catalog"."BrandStatus" NOT NULL DEFAULT 'active',
    "merged_into_brand_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."brand_alias" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "alias" CITEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_alias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_slug_key" ON "catalog"."brand"("slug");

-- CreateIndex
CREATE INDEX "brand_status_idx" ON "catalog"."brand"("status");

-- CreateIndex
CREATE INDEX "brand_deleted_at_idx" ON "catalog"."brand"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_alias_alias_key" ON "catalog"."brand_alias"("alias");

-- CreateIndex
CREATE INDEX "brand_alias_brand_id_idx" ON "catalog"."brand_alias"("brand_id");

-- AddForeignKey
ALTER TABLE "catalog"."brand" ADD CONSTRAINT "brand_merged_into_brand_id_fkey" FOREIGN KEY ("merged_into_brand_id") REFERENCES "catalog"."brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."brand_alias" ADD CONSTRAINT "brand_alias_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "catalog"."brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

