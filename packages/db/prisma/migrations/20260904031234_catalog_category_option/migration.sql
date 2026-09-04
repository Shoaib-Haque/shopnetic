-- CreateEnum
CREATE TYPE "catalog"."OptionApplicability" AS ENUM ('required', 'optional', 'not_applicable');

-- CreateEnum
CREATE TYPE "catalog"."ValueSource" AS ENUM ('predefined', 'open', 'hybrid');


-- CreateTable
CREATE TABLE "catalog"."value_set" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "value_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."value_set_item" (
    "value_set_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "value_set_item_pkey" PRIMARY KEY ("value_set_id","option_value_id")
);

-- CreateTable
CREATE TABLE "catalog"."category_option" (
    "category_id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "applicability" "catalog"."OptionApplicability" NOT NULL DEFAULT 'optional',
    "is_variant_axis" BOOLEAN NOT NULL DEFAULT true,
    "value_source" "catalog"."ValueSource" NOT NULL DEFAULT 'open',
    "value_set_id" UUID,
    "price_impact" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "category_option_pkey" PRIMARY KEY ("category_id","option_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "value_set_name_key" ON "catalog"."value_set"("name");

-- CreateIndex
CREATE INDEX "value_set_item_option_value_id_idx" ON "catalog"."value_set_item"("option_value_id");

-- CreateIndex
CREATE INDEX "category_option_option_type_id_idx" ON "catalog"."category_option"("option_type_id");

-- CreateIndex
CREATE INDEX "category_option_value_set_id_idx" ON "catalog"."category_option"("value_set_id");

-- AddForeignKey
ALTER TABLE "catalog"."value_set_item" ADD CONSTRAINT "value_set_item_value_set_id_fkey" FOREIGN KEY ("value_set_id") REFERENCES "catalog"."value_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."value_set_item" ADD CONSTRAINT "value_set_item_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "catalog"."option_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."category_option" ADD CONSTRAINT "category_option_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog"."category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."category_option" ADD CONSTRAINT "category_option_option_type_id_fkey" FOREIGN KEY ("option_type_id") REFERENCES "catalog"."option_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog"."category_option" ADD CONSTRAINT "category_option_value_set_id_fkey" FOREIGN KEY ("value_set_id") REFERENCES "catalog"."value_set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

