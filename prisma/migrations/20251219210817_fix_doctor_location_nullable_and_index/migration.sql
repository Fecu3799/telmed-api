-- This is an empty migration.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

ALTER TABLE "doctor_profiles"
  ALTER COLUMN "location" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "doctor_profiles_location_gist_idx"
  ON "doctor_profiles"
  USING GIST ("location");
