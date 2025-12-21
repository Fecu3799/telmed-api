ALTER TABLE "doctor_profiles"
  ADD COLUMN "price_cents" INTEGER NOT NULL DEFAULT 0;

UPDATE "doctor_profiles"
SET "price_cents" = "price" * 100;

UPDATE "users" AS u
SET "display_name" = d."display_name"
FROM "doctor_profiles" AS d
WHERE u.id = d.user_id
  AND u."display_name" IS NULL
  AND d."display_name" IS NOT NULL;

ALTER TABLE "doctor_profiles" DROP COLUMN "price";
ALTER TABLE "doctor_profiles" DROP COLUMN "display_name";
