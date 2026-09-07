-- Category name (`name_i18n->>'en'`, case-insensitive) and `slug` become
-- GLOBALLY unique among live (non-archived) rows, replacing the old
-- per-parent `(parent_id, slug)` constraint.
--
-- Existing live duplicates are auto-suffixed so the new indexes can be built:
--   slug  "phones"      -> "phones-2", "phones-3", ...   (oldest row keeps "phones")
--   name  "Electronics" -> "Electronics (2)", ...        (oldest row keeps it)
-- Archived rows are left untouched — the partial indexes ignore them, and
-- `restore` re-checks a row's name/slug before un-archiving it.

-- DropIndex (old per-parent slug uniqueness)
DROP INDEX IF EXISTS "catalog"."category_parent_id_slug_key";

-- Dedupe live slugs
WITH d AS (
  SELECT id,
         slug,
         row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS rn
    FROM "catalog"."category"
   WHERE deleted_at IS NULL
)
UPDATE "catalog"."category" c
   SET slug = d.slug || '-' || d.rn
  FROM d
 WHERE c.id = d.id
   AND d.rn > 1;

-- Dedupe live names (`en`, case-insensitive)
WITH d AS (
  SELECT id,
         name_i18n->>'en' AS en,
         row_number() OVER (PARTITION BY lower(name_i18n->>'en') ORDER BY created_at, id) AS rn
    FROM "catalog"."category"
   WHERE deleted_at IS NULL
)
UPDATE "catalog"."category" c
   SET name_i18n = jsonb_set(c.name_i18n, '{en}', to_jsonb(d.en || ' (' || d.rn || ')'))
  FROM d
 WHERE c.id = d.id
   AND d.rn > 1;

-- CreateIndex (global, live-only)
CREATE UNIQUE INDEX "category_slug_key"
    ON "catalog"."category" ("slug")
 WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX "category_name_en_lower_key"
    ON "catalog"."category" (lower(name_i18n->>'en'))
 WHERE deleted_at IS NULL;
