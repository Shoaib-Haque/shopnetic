-- AlterTable: Add deleted_at and nullable option_type_id to catalog.value_set
ALTER TABLE "catalog"."value_set" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
ALTER TABLE "catalog"."value_set" ADD COLUMN "option_type_id" UUID;

-- Backfill option_type_id from existing value_set_item -> option_value
UPDATE "catalog"."value_set" vs
   SET "option_type_id" = sub.option_type_id
  FROM (
    SELECT vsi.value_set_id, ov.option_type_id
      FROM "catalog"."value_set_item" vsi
      JOIN "catalog"."option_value" ov ON ov.id = vsi.option_value_id
     GROUP BY vsi.value_set_id, ov.option_type_id
  ) sub
 WHERE vs.id = sub.value_set_id;

-- Backfill any empty value set referenced by category_option
UPDATE "catalog"."value_set" vs
   SET "option_type_id" = co.option_type_id
  FROM "catalog"."category_option" co
 WHERE co.value_set_id = vs.id
   AND vs.option_type_id IS NULL;

-- Remove genuinely empty, unreferenced value sets that have no option type
DELETE FROM "catalog"."value_set" vs
 WHERE vs.option_type_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "catalog"."category_option" co WHERE co.value_set_id = vs.id
   );

-- Fail loudly if any value set remains without an option_type_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "catalog"."value_set" WHERE "option_type_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL on catalog.value_set.option_type_id: some value sets could not be associated with an option type.';
  END IF;
END $$;

-- Enforce NOT NULL on option_type_id
ALTER TABLE "catalog"."value_set" ALTER COLUMN "option_type_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "catalog"."value_set" ADD CONSTRAINT "value_set_option_type_id_fkey"
    FOREIGN KEY ("option_type_id") REFERENCES "catalog"."option_type"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old global unique index on name
DROP INDEX IF EXISTS "catalog"."value_set_name_key";

-- Create hand-managed partial unique index on lower(name) for live rows
CREATE UNIQUE INDEX "value_set_name_lower_key"
    ON "catalog"."value_set" (lower(name))
 WHERE deleted_at IS NULL;

-- CreateIndex
CREATE INDEX "value_set_option_type_id_idx" ON "catalog"."value_set"("option_type_id");
CREATE INDEX "value_set_deleted_at_idx" ON "catalog"."value_set"("deleted_at");
