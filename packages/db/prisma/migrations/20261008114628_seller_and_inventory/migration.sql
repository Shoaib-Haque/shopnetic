-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "inventory";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "seller";

-- CreateEnum
CREATE TYPE "seller"."SellerType" AS ENUM ('individual', 'business');

-- CreateEnum
CREATE TYPE "seller"."SellerStatus" AS ENUM ('draft', 'in_review', 'approved', 'suspended', 'offboarding', 'closed');

-- CreateEnum
CREATE TYPE "inventory"."OfferCondition" AS ENUM ('new', 'refurbished_like_new', 'refurbished_good', 'used_like_new', 'used_good', 'used_fair');

-- CreateEnum
CREATE TYPE "inventory"."OfferStatus" AS ENUM ('active', 'paused', 'out_of_stock', 'under_review', 'suppressed');


-- CreateTable
CREATE TABLE "seller"."seller" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "type" "seller"."SellerType" NOT NULL DEFAULT 'business',
    "country" CHAR(2) NOT NULL,
    "status" "seller"."SellerStatus" NOT NULL DEFAULT 'draft',
    "commission_override_bps" INTEGER,
    "reserve_bps" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller"."shop" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "banner_url" TEXT,
    "vacation_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller"."outbox" (
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

-- CreateTable
CREATE TABLE "inventory"."warehouse" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "address" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."offer" (
    "id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "price_minor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "sale_price_minor" BIGINT,
    "sale_starts_at" TIMESTAMPTZ(6),
    "sale_ends_at" TIMESTAMPTZ(6),
    "compare_at_minor" BIGINT,
    "condition" "inventory"."OfferCondition" NOT NULL DEFAULT 'new',
    "condition_notes" TEXT,
    "handling_days" INTEGER NOT NULL DEFAULT 1,
    "status" "inventory"."OfferStatus" NOT NULL DEFAULT 'active',
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "max_qty" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."stock" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "safety_stock" INTEGER NOT NULL DEFAULT 0,
    "backorder" BOOLEAN NOT NULL DEFAULT false,
    "restock_eta" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory"."buybox" (
    "variant_id" UUID NOT NULL,
    "winning_offer_id" UUID,
    "winning_seller_id" UUID,
    "winning_seller_name" TEXT,
    "winning_price_minor" BIGINT,
    "winning_currency" VARCHAR(3),
    "seller_count" INTEGER NOT NULL DEFAULT 0,
    "min_price_minor" BIGINT,
    "max_price_minor" BIGINT,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buybox_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "inventory"."outbox" (
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
CREATE UNIQUE INDEX "seller_account_id_key" ON "seller"."seller"("account_id");

-- CreateIndex
CREATE INDEX "seller_status_idx" ON "seller"."seller"("status");

-- CreateIndex
CREATE INDEX "seller_deleted_at_idx" ON "seller"."seller"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_seller_id_key" ON "seller"."shop"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_slug_key" ON "seller"."shop"("slug");

-- CreateIndex
CREATE INDEX "shop_deleted_at_idx" ON "seller"."shop"("deleted_at");

-- CreateIndex
CREATE INDEX "outbox_published_at_idx" ON "seller"."outbox"("published_at");

-- CreateIndex
CREATE INDEX "warehouse_seller_id_idx" ON "inventory"."warehouse"("seller_id");

-- CreateIndex
CREATE INDEX "warehouse_deleted_at_idx" ON "inventory"."warehouse"("deleted_at");

-- CreateIndex
CREATE INDEX "offer_seller_id_idx" ON "inventory"."offer"("seller_id");

-- CreateIndex
CREATE INDEX "offer_variant_id_status_idx" ON "inventory"."offer"("variant_id", "status");

-- CreateIndex
CREATE INDEX "offer_status_idx" ON "inventory"."offer"("status");

-- CreateIndex
CREATE INDEX "offer_deleted_at_idx" ON "inventory"."offer"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "offer_seller_variant_active_unique" ON "inventory"."offer"("seller_id", "variant_id") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "stock_warehouse_id_idx" ON "inventory"."stock"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_offer_id_warehouse_id_key" ON "inventory"."stock"("offer_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "buybox_winning_offer_id_idx" ON "inventory"."buybox"("winning_offer_id");

-- CreateIndex
CREATE INDEX "outbox_published_at_idx" ON "inventory"."outbox"("published_at");

-- AddForeignKey
ALTER TABLE "seller"."shop" ADD CONSTRAINT "shop_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "seller"."seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "inventory"."offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "inventory"."warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
