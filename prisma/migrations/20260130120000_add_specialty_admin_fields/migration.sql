-- Add admin-managed fields to specialties
ALTER TABLE "specialties"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deactivated_at" TIMESTAMP(3),
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill slug with a unique, deterministic value based on name + id
UPDATE "specialties"
SET "slug" = (
  regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g') || '-' || substr(id, 1, 8)
);

ALTER TABLE "specialties"
  ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "specialties_slug_key" ON "specialties"("slug");
