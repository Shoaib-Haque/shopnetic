-- Add partial unique index on file_key for internally-generated storage keys.
-- Internal keys always start with "<ownerType>/<ownerId>/" where ownerId is a UUID.
-- External URLs (pasted CDN links) are not constrained and can be shared.
CREATE UNIQUE INDEX "media_asset_internal_file_key_unique"
  ON "catalog"."media_asset" ("file_key")
  WHERE "file_key" ~ '^[a-z]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text;
