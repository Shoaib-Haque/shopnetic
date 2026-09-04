-- CreateEnum
CREATE TYPE "catalog"."OptionDataType" AS ENUM ('select', 'text', 'number', 'bool', 'swatch');

-- CreateEnum
CREATE TYPE "catalog"."OptionTypeStatus" AS ENUM ('active', 'deprecated');

-- CreateEnum
CREATE TYPE "catalog"."OptionValueStatus" AS ENUM ('active', 'deprecated');

-- CreateTable
CREATE TABLE "catalog"."option_type" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_i18n" JSONB NOT NULL,
    "data_type" "catalog"."OptionDataType" NOT NULL DEFAULT 'select',
    "has_swatch" BOOLEAN NOT NULL DEFAULT false,
    "status" "catalog"."OptionTypeStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "option_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog"."option_value" (
    "id" UUID NOT NULL,
    "option_type_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label_i18n" JSONB NOT NULL,
    "swatch_hex" TEXT,
    "swatch_image_key" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "catalog"."OptionValueStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "option_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "option_type_code_key" ON "catalog"."option_type"("code");

-- CreateIndex
CREATE INDEX "option_type_status_idx" ON "catalog"."option_type"("status");

-- CreateIndex
CREATE INDEX "option_type_deleted_at_idx" ON "catalog"."option_type"("deleted_at");

-- CreateIndex
CREATE INDEX "option_value_option_type_id_idx" ON "catalog"."option_value"("option_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "option_value_option_type_id_code_key" ON "catalog"."option_value"("option_type_id", "code");

-- AddForeignKey
ALTER TABLE "catalog"."option_value" ADD CONSTRAINT "option_value_option_type_id_fkey" FOREIGN KEY ("option_type_id") REFERENCES "catalog"."option_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
