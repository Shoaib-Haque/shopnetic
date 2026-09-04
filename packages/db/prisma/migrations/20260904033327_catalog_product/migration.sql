-- CreateEnum
CREATE TYPE "catalog"."ProductStatus" AS ENUM ('draft', 'pending', 'active', 'archived');

-- CreateEnum
CREATE TYPE "catalog"."VariantStatus" AS ENUM ('active', 'inactive');


-- CreateTable
CREATE TABLE "catalog"."product" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "brand_id" UUID,
    "title_i18n" JSONB NOT NULL,
    "description_i18n" JSONB,
    "slug" TEXT NOT NULL,
    "status" "catalog"."ProductStatus" NOT NULL DEFAULT 'draft',
    "base_price_minor" BIGINT,
    "currency" CHAR(3),
    "spec" JSONB NOT NULL DEFAULT '{}',
    "proposed_by_seller_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."product_option" (
    "product_id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "required_value_id" UUID,

    CONSTRAINT "product_option_pkey" PRIMARY KEY ("product_id","option_type_id")
);

-- CreateTable
CREATE TABLE "catalog"."product_option_value" (
    "product_id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_value_pkey" PRIMARY KEY ("product_id","option_type_id","option_value_id")
);

-- CreateTable
CREATE TABLE "catalog"."variant" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku_code" TEXT,
    "gtin" TEXT,
    "weight_g" INTEGER,
    "dims" JSONB,
    "combo_signature" TEXT NOT NULL,
    "status" "catalog"."VariantStatus" NOT NULL DEFAULT 'active',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."variant_option_value" (
    "variant_id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "variant_option_value_pkey" PRIMARY KEY ("variant_id","option_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_slug_key" ON "catalog"."product"("slug");

-- CreateIndex
CREATE INDEX "product_category_id_idx" ON "catalog"."product"("category_id");

-- CreateIndex
CREATE INDEX "product_brand_id_idx" ON "catalog"."product"("brand_id");

-- CreateIndex
CREATE INDEX "product_status_idx" ON "catalog"."product"("status");

-- CreateIndex
CREATE INDEX "product_deleted_at_idx" ON "catalog"."product"("deleted_at");

-- CreateIndex
CREATE INDEX "product_option_option_type_id_idx" ON "catalog"."product_option"("option_type_id");

-- CreateIndex
CREATE INDEX "product_option_required_value_id_idx" ON "catalog"."product_option"("required_value_id");

-- CreateIndex
CREATE INDEX "product_option_value_option_value_id_idx" ON "catalog"."product_option_value"("option_value_id");

-- CreateIndex
CREATE INDEX "variant_product_id_idx" ON "catalog"."variant"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "variant_product_id_combo_signature_key" ON "catalog"."variant"("product_id", "combo_signature");

-- CreateIndex
CREATE UNIQUE INDEX "variant_product_id_sku_code_key" ON "catalog"."variant"("product_id", "sku_code");

-- CreateIndex
CREATE INDEX "variant_option_value_option_value_id_idx" ON "catalog"."variant_option_value"("option_value_id");

-- AddForeignKey
ALTER TABLE "catalog"."product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog"."category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product" ADD CONSTRAINT "product_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "catalog"."brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_option" ADD CONSTRAINT "product_option_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_option" ADD CONSTRAINT "product_option_option_type_id_fkey" FOREIGN KEY ("option_type_id") REFERENCES "catalog"."option_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_option" ADD CONSTRAINT "product_option_required_value_id_fkey" FOREIGN KEY ("required_value_id") REFERENCES "catalog"."option_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_option_value" ADD CONSTRAINT "product_option_value_product_id_option_type_id_fkey" FOREIGN KEY ("product_id", "option_type_id") REFERENCES "catalog"."product_option"("product_id", "option_type_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."product_option_value" ADD CONSTRAINT "product_option_value_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "catalog"."option_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."variant" ADD CONSTRAINT "variant_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catalog"."product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."variant_option_value" ADD CONSTRAINT "variant_option_value_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "catalog"."variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."variant_option_value" ADD CONSTRAINT "variant_option_value_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "catalog"."option_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

