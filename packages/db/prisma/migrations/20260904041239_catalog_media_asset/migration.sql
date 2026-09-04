-- CreateEnum
CREATE TYPE "catalog"."MediaOwnerType" AS ENUM ('product', 'offer');

-- CreateEnum
CREATE TYPE "catalog"."MediaKind" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "catalog"."MediaAssetStatus" AS ENUM ('pending', 'active', 'rejected');


-- CreateTable
CREATE TABLE "catalog"."media_asset" (
    "id" UUID NOT NULL,
    "owner_type" "catalog"."MediaOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "catalog"."MediaKind" NOT NULL,
    "file_key" TEXT NOT NULL,
    "poster_key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_s" INTEGER,
    "blurhash" TEXT,
    "alt_i18n" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "catalog"."MediaAssetStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."media_option_tag" (
    "media_asset_id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "media_option_tag_pkey" PRIMARY KEY ("media_asset_id","option_type_id")
);

-- CreateIndex
CREATE INDEX "media_asset_owner_type_owner_id_idx" ON "catalog"."media_asset"("owner_type", "owner_id");

-- CreateIndex
CREATE INDEX "media_asset_status_idx" ON "catalog"."media_asset"("status");

-- CreateIndex
CREATE INDEX "media_option_tag_option_value_id_idx" ON "catalog"."media_option_tag"("option_value_id");

-- AddForeignKey
ALTER TABLE "catalog"."media_option_tag" ADD CONSTRAINT "media_option_tag_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "catalog"."media_asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."media_option_tag" ADD CONSTRAINT "media_option_tag_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "catalog"."option_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

